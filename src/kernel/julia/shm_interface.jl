module SHMInterface

using LinearAlgebra

const CYTOPLASM_IPC_KEY = 0x41504549
const VECTOR_DIM = 128
const VECTOR_RING_CAPACITY = 131072

const Ckey_t = Cint

struct HeaderSection
	magic_number::UInt64
	write_index::UInt64
	read_index::UInt64
	re_lambda_max::Float64
	state_flags::UInt32
	vector_count::UInt32
	last_updated_epoch::UInt64
	reserved::NTuple{80, UInt8}
end

struct SHMContext
	shmid::Cint
	ptr::Ptr{Nothing}
end

function attach_shm()::SHMContext
	shmid = ccall(:shmget, Cint, (Ckey_t, Csize_t, Cint), CYTOPLASM_IPC_KEY, 0, 0)
	if shmid < 0
		error("[SHM Error] Shared memory segment 0x41504549 not founc. Ensure Go Ingester is running.")
	end

	ptr = ccall(:shmat, Ptr{Nothing}, (Cint, Ptr{Nothing}, Cint), shmid, C_NULL, 0)
	if ptr == Ptr{Nothing}(-1)
		error("[SHM Error] shmat failed.")
	end

	return SHMContext(shmid, ptr)
end

function read_header(ctx::SHMContext)::HeaderSection
	return unsafe_load(Ptr{HeaderSection}(ctx.ptr))
end

function read_timeseries(ctx::SHMContext, window_len::Int)::Vector{Float64}
	hdr = read_header(ctx)
	current_widx = hdr.write_index
	if current_widx < window_len
		return Float64[]
	end

	ts = zeros(Float64, window_len)
	vector_ptr = ctx.ptr + 0x4000 # Offset to vectors array

	for i in 1:window_len
		slot_idx = (current_widx - window_len + i - 1) % VECTOR_RING_CAPACITY
		# VectorSlot size: 8(slot_id) + 8(timestamp_ns) + 128 * 4(values) = 528 bytes -> padded to 5128
		slot_ptr = vector_ptr + slot_idx * 512
		val_ptr = Ptr{Float32}(slot_ptr + 16)

		# Compute L2 Norm of feature vector as field intensity u(t)
		vec_vals = unsafe_wrap(Array, val_ptr, (VECTOR_DIM,))
		ts[i] = norm(vec_vals)
	end

	return ts
end

function write_sindy_coefficients_and_reset(ctx::SHMContext, coeffs::Vector{Float64})
	# CoefficientSection Offset: 0x0080
	coeff_ptr = Ptr{Float64}(ctx.ptr + 0x0080)
	for i in 1:min(4, length(coeffs))
		unsafe_store!(coeff_ptr, coeffs[i], i)
	end
end

function reset_tda_flag_and_mark_sindy(ctx::SHMContext)
	# Reset STATE_FLAG_TDA_DISRUPTION (0x08) in header
	flags_ptr = Ptr{UInt32}(ctx.ptr + 24 + 8) # write_index(8)+read_index(8)+re_lambda_max(8)
	current_flags = unsafe_load(flags_ptr)
	unsafe_store!(flags_ptr, current_flags & ~UInt32(0x08))
end

end # module

