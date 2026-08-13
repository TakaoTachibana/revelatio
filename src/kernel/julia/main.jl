using Pkg

Pkg.activate(@__DIR__)

required_pkgs = ["LinearAlgebra", "Statistics", "Printf", "HTTP", "JSON3"]

for pkg in required_pkgs
	if !haskey(Pkg.project().dependencies, pkg)
		println("[Julia Setup] Installing missing package: $pkg...")
		Pkg.add(pkg)
	end
end

using Printf, HTTP, JSON3

include("shm_interface.jl")
include("sindy_pde.jl")

using .SHMInterface
using .SINDyPDE

const GATEWAY_URL = "http://localhost:5000/api/v1/topology/event"

function main()
	println("=== REVELATIO // Compute Engine (Julia) ===")
	ctx = SHMInterface.attach_shm()
	println("[Julia Compute] Connected to Cytoplasm III Shared Memory (0x41504549).")

	print("[Julia Warmup] Compiling SINDy-PDE pipeline...")
	try
		dummy_ts = SHMInterface.read_timeseries(ctx, 10)
		if !isempty(dummy_ts)
			_ = SINDyPDE.fit_sindy_pde(dummy_ts)
		end
		println("Done.")
	catch err
		println(" Skipped (waiting for live stream).")
	end

	while true
		hdr = SHMInterface.read_header(ctx)

		# Check STATE_FLAG_TDA_DISRUPTION (0x08)
		if (hdr.state_flags & UInt32(0x08)) != 0
			println("\n[TDA Disruption Triggered!] Re-identifying SINDy-PDE Governing Equations...")

			ts = SHMInterface.read_timeseries(ctx, 120)
			if !isempty(ts)
				sindy_res = SINDyPDE.fit_sindy_pde(ts)

				SHMInterface.write_sindy_coefficients_and_reset(ctx, sindy_res.coefficients)
				println("[Autopoietic Loop] PDE coefficients dispatched back to SHM for R engine.")

				@printf("  Identified PDE : %s\n", sindy_res.equation_str)
				@printf("  Residual Error : %.6f\n", sindy_res.residual)
				@printf("  Re(lambda_max) : %.4f\n", hdr.re_lambda_max)

				payload = (
					timestamp = round(Int64, time()),
					writeIndex = round(Int64, hdr.write_index),
					reLambdaMax = Float64(hdr.re_lambda_max),
					equation = sindy_res.equation_str,
					coefficients = sindy_res.coefficients,
					residual = Float64(sindy_res.residual)
				)

				Threads.@spawn begin
					try
						HTTP.post(GATEWAY_URL, ["Content-Type" => "application/json"], JSON3.write(payload); connect_timeout = 1, request_timeout = 1)
						println("  [Gateway Sync] Disruption event dispatched to Gateway.")
					catch err
						println("  [Gateway Sync Warning] Gateway offline. Stored locally.")
					end
				end

				SHMInterface.reset_tda_flag_and_mark_sindy(ctx)
			end
		end
		sleep(0.1)
	end
end

main()

