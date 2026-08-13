#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ipc.h>
#include <sys/shm.h>
#include "../../include/cytoplasm_v3.h"

CytoplasmV3 * cytoplasm_attach(int *shmid_out) {
	int shmid = shmget((key_t)CYTOPLASM_IPC_KEY, sizeof(CytoplasmV3), IPC_CREAT | 0666);
	if (shmid < 0) {
		perror("shamget failed");
		return NULL;
	}

	void *shm_ptr = shmat(shmid, NULL, 0);
	if (shm_ptr == (void *)-1) {
		perror("shmat failed");
		return NULL;
	}

	if (shmid_out != NULL) {
		*shmid_out = shmid;
	}

	CytoplasmV3 *cytoplasm = (CytoplasmV3 *)shm_ptr;
	if (cytoplasm->header.magic_number != 0x4150454952455633ULL) {
		cytoplasm->header.magic_number = 0x4150454952455633ULL;
		cytoplasm->header.re_lambda_max = -0.45;
		cytoplasm->header.state_flags = STATE_FLAG_STABLE;
		cytoplasm->header.write_index = 0;
		cytoplasm->header.read_index = 0;
	}

	return cytoplasm;
}

int cytoplasm_detach(CytoplasmV3 *cytoplasm) {
	if (cytoplasm == NULL ) {
		return -1;
	}
	return shmdt((void *)cytoplasm);
}

