#include <RcppArmadillo.h>
#include <sys/ipc.h>
#include <sys/shm.h>
#include <cstdint>
#include <vector>
#include <algorithm>
#include "../../../include/cytoplasm_v3.h"

// [[Rcpp::depends(RcppArmadillo)]]

using namespace Rcpp;

// [[Rcpp::export]]
SEXP attach_shm_v3_cpp(int key, size_t size) {
	int shmid = shmget((key_t)key, 0, 0);
	if (shmid < 0) {
		Rcpp::stop("[R Analytics] Cytoplasm III Shared Memory not found.");
	}
	void* ptr = shmat(shmid, NULL, 0);
	if (ptr == (void*)-1) {
		Rcpp::stop("[R Analytics] Failed to attach Cytoplasm III Shared Memory.");
	}
	return Rcpp::XPtr<CytoplasmV3>(static_cast<CytoplasmV3*>(ptr), false);
}

// [[Rcpp::export]]
List compute_fast_coupling_spectrum_cpp(const arma::mat& L, const arma::mat& A_mean) {
	// Kronecker Eigenvalue Theorem Acceleration: O(N^3 + r^3) vs O((N*r)^3)
	arma::cx_vec eig_L;
	arma::cx_vec eig_A;

	arma::eig_gen(eig_L, L);
	arma::eig_gen(eig_A, A_mean);

	double max_re_lambda = -1e9;

	for (size_t i = 0; i < eig_L.n_elem; i++) {
		for (size_t j = 0; j < eig_A.n_elem; j++) {
			std::complex<double> lambda_kron = - eig_L[i] * eig_A[j];
			double re = lambda_kron.real();
			if (re < 0.0 && re > max_re_lambda) {
				max_re_lambda = re;
			}
		}
	}

	bool csd_critical = (max_re_lambda > -0.05);

	return List::create(
		Named("re_lambda_max") = max_re_lambda,
		Named("csd_critical") = csd_critical
	);
}

// [[Rcpp::export]]
List read_shm_vectors_v3_cpp(SEXP xp, int window_size) {
	Rcpp::XPtr<CytoplasmV3> shm(xp);
	uint64_t write_idx = shm->header.write_index;

	if (write_idx < (uint64_t)window_size) {
		return List::create(Named("valid") = false);
	}

	NumericMatrix feature_mat(window_size, VECTOR_DIM);
	NumericVector intensity_ts(window_size);

	uint64_t start_idx = write_idx - window_size;

	for (int i = 0; i < window_size; i++) {
		uint64_t curr_slot_idx = (start_idx + i) % VECTOR_RING_CAPACITY;
		uint64_t prev_slot_idx = (start_idx + i - 1) % VECTOR_RING_CAPACITY;

		const VectorSlot& curr_slot = shm->vectors[curr_slot_idx];
		const VectorSlot& prev_slot = shm->vectors[prev_slot_idx];

		double dist_sq = 0.0;
		for (int d = 0; d < VECTOR_DIM; d++) {
			float val = curr_slot.values[d];
			feature_mat(i, d) = val;

			double diff = (double)val - (double)prev_slot.values[d];
			dist_sq += diff * diff;
		}
		// Calculate Semantic Drift Velocity u(t) = ||v_t - v_{t - 1}||
		intensity_ts[i] = std::sqrt(dist_sq);
	}

	return List::create (
		Named("valid") = true,
		Named("intensity_ts") = intensity_ts,
		Named("features") = feature_mat,
		Named("write_index") = (double)write_idx
	);
}

// [[Rcpp::export]]
void update_shm_state_and_particles_cpp(SEXP xp, int flags, double re_lambda, IntegerVector trigger_slots, NumericVector scores) {
	Rcpp::XPtr<CytoplasmV3> shm(xp);

	shm->header.re_lambda_max = re_lambda;
	shm->header.state_flags = static_cast<uint32_t>(flags);

	// Write Particle Attribution output for C# Gateway zero-copy read
	int count = std::min((int)trigger_slots.size(), (int)MAX_TOP_TRIGGER_POSTS);
	shm->particle_output.trigger_count = count;

	for (int i = 0; i < count; i++) {
		shm->particle_output.trigger_slot_indices[i] = static_cast<uint32_t>(trigger_slots[i]);
		shm->particle_output.scores[i] = scores[i];
	}

	shm->particle_output.calculated_at_ns = static_cast<uint64_t>(std::time(NULL));
}

// [[Rcpp::export]]
List check_sindy_feedback_v3_cpp(SEXP xp) {
	Rcpp::XPtr<CytoplasmV3> shm(xp);

	// Read SINDy-PDE coefficients Written by Julia
	double c1 = shm->coefficients.c1;
	double c2 = shm->coefficients.c2;
	double c3 = shm->coefficients.c3;
	double c4 = shm->coefficients.c4;

	if (!std::isfinite(c1)) {
		c1 = 0.0;
	}
	if (!std::isfinite(c2)) {
		c2 = 0.0;
	}
	if (!std::isfinite(c3)) {
		c3 = 0.0;
	}
	if (!std::isfinite(c4)) {
		c4 = 0.0;
	}

	return List::create (
		Named("c1") = c1, Named("c2") = c2,
		Named("c3") = c3, Named("c4") = c4
	);
}

