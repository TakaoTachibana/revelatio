/**
	* @file cytoplasm_v3.h
	* @brief REVELATIO Cytoplasm III Shared Memory Layout Specification
	* @details System V Shared Memory (Key: 0x41504549 / "APEI", Size: 256 MB)
	*/

#ifndef CYTOPLASM_V3_H
#define CYTOPLASM_V3_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ======================
 * Constant Definitions
 * ====================== */

#define CYTOPLASM_IPC_KEY 0x41504549U
#define CYTOPLASM_SHM_SIZE (256 * 1024 * 1024U)

/* Vector Buffer Configration */
#define VECTOR_DIM 128
#define VECTOR_RING_CAPACITY 131072U

/* Text Metadata LRU Buffer Configration */
#define TEXT_LRU_CAPACITY 1000U
#define TEXT_URI_MAX_LEN 256
#define TEXT_AUTHOR_MAX_LEN 128
#define TEXT_BODY_MAX_LEN 2048

/* Paricle Attribution Output Area */
#define MAX_TOP_TRIGGER_POSTS 16U

/* System State Flags */
#define STATE_FLAG_STABLE 0x00
#define STATE_FLAG_QUIET 0x01
#define STATE_FLAG_PERTURBED 0x02
#define STATE_FLAG_CRITICAL 0x04
#define STATE_FLAG_TDA_DISRUPTION 0x08

#pragma pack(push, 1)

/* ==============================
 * 1. Header Section (128 Bytes)
 * ============================== */

typedef struct {
	uint64_t magic_number;
	uint64_t write_index;
	uint64_t read_index;
	double re_lambda_max;
	uint32_t state_flags;
	uint32_t vector_count;
	uint64_t last_updated_epoch;
	uint8_t reserved[80];
} HeaderSection;

/* ==========================================
 * 2. Coefficient Section (128 Bytes)
 * ========================================== */

typedef struct {
	double c1;
	double c2;
	double c3;
	double c4;
	double residual;
	double tda_h1_persistence;
	uint64_t fit_timestamp;
	uint8_t reserved[72];
} CoefficientSection;

/* =============================================================
 * 3. Text Slot Struct (19,200 Bytes per Slot)
 * ============================================================= */
	
typedef struct {
	uint64_t slot_id;
	uint64_t timestamp_ns;
	char uri[TEXT_URI_MAX_LEN];
	char author[TEXT_AUTHOR_MAX_LEN];
	char text[TEXT_BODY_MAX_LEN];
	double spectral_contribution_score;
	uint8_t reserved[16688];
} TextSlot;

/* ========================================================================
 * 4. Particle Attribution Output Area (For C# Gateway Zero-Copy Read)
 * ======================================================================== */

typedef struct {
	uint32_t trigger_count;
	uint32_t trigger_slot_indices[MAX_TOP_TRIGGER_POSTS];
	double scores[MAX_TOP_TRIGGER_POSTS];
	uint64_t calculated_at_ns;
	uint8_t reserved[128];
} ParticleOutputArea;

/* =====================================================
 * 5. Feature Vector Slot Struct (512 Bytes)
 * ===================================================== */

typedef struct {
	uint64_t slot_id;
	uint64_t timestamp_ns;
	float values[VECTOR_DIM];
} VectorSlot;

/* ============================================================
 * 6. Cytoplasm III Full Shared Memory Structure Definition
 * ============================================================ */

typedef struct {
	HeaderSection header;
	CoefficientSection coefficients;
	ParticleOutputArea particle_output;
	uint8_t reserved_meta[15796];

	VectorSlot vectors[VECTOR_RING_CAPACITY];
	TextSlot text_lru[TEXT_LRU_CAPACITY];
} CytoplasmV3;

#pragma pack(pop)

/* C Function Prototypes for CGO Linkage */
CytoplasmV3* cytoplasm_attach(int *shmid_out);
int cytoplasm_detach(CytoplasmV3 *cytoplasm);

/* C / C++ Static Assert Compatibility Macro */
#ifdef __cplusplus
	#ifndef _Static_assert
		#define _Static_assert static_assert
	#endif
#endif

/* Memory Offset Verification Macros */
_Static_assert(sizeof(HeaderSection) == 128, "HeaderSection size must be 128 bytes");
_Static_assert(sizeof(CoefficientSection) == 128, "CoefficientSection size must be 128 bytes");
_Static_assert(offsetof(CytoplasmV3, vectors) == 0x4000, "Vector ring offset must be 16KB");

#ifdef __cplusplus
}
#endif

#endif /* CYTOPLASM_V3_H */

