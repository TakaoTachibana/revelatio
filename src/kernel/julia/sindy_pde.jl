module SINDyPDE

using LinearAlgebra, Statistics, Printf

struct SINDyResult
	coefficients::Vector{Float64}
	equation_str::String
	residual::Float64
end

function fit_sindy_pde(ts::Vector{Float64})::SINDyResult
	N = length(ts)
	if N < 10
		return SINDyResult(zeros(4), "u_t = 0", 0.0)
	end

	dx = 0.1
	dt = 0.1
	tau = 2
	Nx = 5

	Nt = N - (Nx - 1) * tau
	if Nt < 5
		return SINDyResult(zeros(4), "u_t = 0", 0.0)
	end

	U = zeros(Nx, Nt)
	for t in 1:Nt
		for x in 1:Nx
			U[x, t] = ts[t + (x - 1) * tau]
		end
	end

	Ut = zeros(Nx, Nt - 2)
	for t in 2:(Nt - 1)
		Ut[:, t - 1] = (U[:, t + 1] - U[:, t - 1]) / (2 * dt)
	end

	Ux = zeros(Nx - 2, Nt - 2)
	Uxx = zeros(Nx - 2, Nt - 2)
	U_crop = U[2:Nx - 1, 2:Nt - 1]

	for x in 2:(Nx - 1)
		for t in 2:(Nt - 1)
			Ux[x - 1, t - 1] = (U[x + 1, t] - U[x - 1, t]) / (2 * dx)
			Uxx[x - 1, t - 1] = (U[x + 1, t] - 2 * U[x, t] + U[x - 1, t]) / (dx^2)
		end
	end

	Y = vec(Ut[2:Nx - 1, :])
	u_vec = vec(U_crop)
	ux_vec = vec(Ux)
	uxx_vec = vec(Uxx)

	Theta = [u_vec (u_vec.^2) ux_vec uxx_vec]

	col_norms = [norm(Theta[:, j]) + 1e-8 for j in 1:size(Theta, 2)]
	Theta_norm = Theta ./ col_norms'

	Lambda = 0.005
	Xi_norm = Theta_norm \ Y

	for iter in 1:10
		small_inds = abs.(Xi_norm) .< Lambda
		Xi_norm[small_inds] .= 0.0
		big_inds = .!small_inds
		if any(big_inds)
			Xi_norm[big_inds] = Theta_norm[:, big_inds] \ Y
		end
	end

	Xi = Xi_norm ./ col_norms
	res = norm(Y - Theta * Xi)
	eq_str = @sprintf("u_t = %.3f*u + %.3f*u^2 + %.3f*u_x + %.3f*u_xx", Xi[1], Xi[2], Xi[3], Xi[4])

	return SINDyResult(Xi, eq_str, res)
end

end # module

