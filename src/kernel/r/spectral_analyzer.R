library(Rcpp)
library(RcppArmadillo)
library(TDA)

sourceCpp("csd_spectrum_v3.cpp")

SHM_KEY <- 0x41504549
SHM_SIZE <- 256 * 1024 * 1024

run_tda_pipeline <- function(time_series) {
	std_val <- sd(time_series)
	if (is.na(std_val) || std_val < 1e-6) {
		return(list(max_persistence = 0.0, disruption = FALSE))
	}
	ts_scaled <- (time_series - mean(time_series)) / std_val
	embedded <- embed(ts_scaled, dimension = 3)

	diag <- ripsDiag(X = embedded, maxdimension = 1, maxscale = 2.5, library = "GUDHI", printProgress = FALSE)
	h1_features <- diag$diagram[diag$diagram[, "dimension"] == 1, , drop = FALSE]

	disruption <- FALSE
	max_pers <- 0.0
	if (nrow(h1_features) > 0) {
		pers <- h1_features[, "Death"] - h1_features[, "Birth"]
		max_pers <- max(pers)
		if (max_pers > 0.35) {
			disruption <- TRUE
		}
	}
	return(list(max_persistence = max_pers, disruption = disruption))
}

main <- function() {
	cat("=== REVELATIO // Analytics Engine (R) ===\n")
	shm_xp <- attach_shm_v3_cpp(SHM_KEY, SHM_SIZE)
	cat("[R Analytics] Attached to Cytoplasm III Shared Memory (0x41504549).\n")

	L <- diag(8) * 3 - matrix(0.3, 8, 8)
	last_write_idx <- 0

	while(TRUE) {
		res_data <- read_shm_vectors_v3_cpp(shm_xp, 120)

		if (isTRUE(res_data$valid) && res_data$write_index > last_write_idx) {
			current_write_idx <- res_data$write_index
			last_write_idx <- current_write_idx

			# 1. Topological Data Analysis (H1 Persistence)
			tda_res <- run_tda_pipeline(res_data$intensity_ts)

			# 2. Check SINDy-PDE Feedback from Julia
			sindy_coeffs <- check_sindy_feedback_v3_cpp(shm_xp)
			c3_val <- sindy_coeffs$c3
			c4_val <- sindy_coeffs$c4

			if (!is.null(c3_val) && !is.null(c4_val) && !is.na(c3_val) && !is.na(c4_val)) {
				if (abs(sindy_coeffs$c3) > 1e-5 || abs(sindy_coeffs$c4) > 1e-5) {
					L <- diag(8) * (3.0 + abs(sindy_coeffs$c3) * 2.0) - matrix(0.3 + abs(sindy_coeffs$c4) * 0.5, 8, 8)
				}
			}

			# 3. Fast Kronecker Coupling Spectrum Calculation
			n_samples <- nrow(res_data$features)
			A_k <- cov(res_data$features[(n_samples - 19):n_samples, 1:4])
			A_k <- A_k / (norm(A_k, "F") + 1e-6)
			csd_res <- compute_fast_coupling_spectrum_cpp(L, A_k)

			# 4. Construct System State Flags
			# STATE_FLAG_STABLE(0x00), PERTURBED(0x02), CRITICAL(0x04), TDA_DISRUPTION(0x08)
			flags <- 0
			if (csd_res$re_lambda_max >= -0.3) {
				flags <- bitwOr(flags, 2)
			}
			if (csd_res$csd_critical) {
				flags <- bitwOr(flags, 4)
			}
			if (tda_res$disruption) {
				flags <- bitwOr(flags, 8) # Triggers Julia's SINDy Loop
			}

			# Extract Trigger Slot Indices for Particle Attribution
			trigger_slots <- integer(0)
			scores <- numeric(0)
			if (TRUE) {
				# Select top slots from window
				slot_range <- (current_write_idx - 16):(current_write_idx - 1)
				trigger_slots <- as.integer(slot_range %% 1000)

				raw_scores <- res_data$intensity_ts[105:120]

				effective_pers <- max(tda_res$max_persistence, 0.05)
				scores <- as.numeric(raw_scores * effective_pers)
			}

			# Update Shared Memory Header & Particle Area
			update_shm_state_and_particles_cpp(shm_xp, flags, csd_res$re_lambda_max, trigger_slots, scores)

			cat(sprintf("\r[R Analytics | Slot: %.0f] H1 Pers: %.4f | Re(lambda_max): %.4f | Flags: 0x%02X",
					current_write_idx, tda_res$max_persistence, csd_res$re_lambda_max, flags))
			flush.console()
		}

		Sys.sleep(0.05) # 50ms polling loop (40x faster than Apeiron II)
	}
}

main()


