package main

/*
#cgo CFLAGS: -I../../include
#include "../../include/cytoplasm_v3.h"
*/
import "C"

import (
	"fmt"
	"sync/atomic"
	"time"
	"unsafe"
)

type SharedMemoryWriter struct {
	shmPtr *C.CytoplasmV3
	shmID C.int
}

func NewSharedMemoryWriter() (*SharedMemoryWriter, error) {
	var shmID C.int
	ptr := C.cytoplasm_attach(&shmID)
	if ptr == nil {
		return nil, fmt.Errorf("failed to attach to Cytoplasm III shared memory")
	}

	return &SharedMemoryWriter {
		shmPtr: ptr,
		shmID: shmID,
	}, nil
}

func (w *SharedMemoryWriter) WritePost(uri, author, text string, vector [128]float32) uint64 {
	nowNs := uint64(time.Now().UnixNano())

	// 1. Atomic Index Increment
	writeIdx := atomic.AddUint64((*uint64)(unsafe.Pointer(&w.shmPtr.header.write_index)), 1) - 1

	// 2. Vector Ring Buffer Slot Write (~64MB Zone)
	vSlotIdx := writeIdx % C.VECTOR_RING_CAPACITY
	vSlot := &w.shmPtr.vectors[vSlotIdx]
	vSlot.slot_id = C.uint64_t(writeIdx)
	vSlot.timestamp_ns = C.uint64_t(nowNs)

	for i := 0; i < C.VECTOR_DIM; i++ {
		vSlot.values[i] = C.float(vector[i])
	}

	// 3. Text LRU Buffer Slot Write (~192MB Zone)
	tSlotIdx := writeIdx % C.TEXT_LRU_CAPACITY
	tSlot := &w.shmPtr.text_lru[tSlotIdx]
	tSlot.slot_id = C.uint64_t(writeIdx)
	tSlot.timestamp_ns = C.uint64_t(nowNs)

	copyCString(unsafe.Pointer(&tSlot.uri[0]), uri, C.TEXT_URI_MAX_LEN)
	copyCString(unsafe.Pointer(&tSlot.author[0]), author, C.TEXT_AUTHOR_MAX_LEN)
	copyCString(unsafe.Pointer(&tSlot.text[0]), text, C.TEXT_BODY_MAX_LEN)

	atomic.StoreUint64((*uint64)(unsafe.Pointer(&w.shmPtr.header.last_updated_epoch)), nowNs)

	return writeIdx
}

func copyCString(dst unsafe.Pointer, src string, maxLen int) {
	bytes := []byte(src)
	if len(bytes) >= maxLen {
		bytes = bytes[:maxLen - 1]
	}
	dstBuf := (*[1 << 30]byte)(dst)[:maxLen:maxLen]
	copy(dstBuf, bytes)
	dstBuf[len(bytes)] = 0
}

func (w *SharedMemoryWriter) Close() {
	if w.shmPtr != nil {
		C.cytoplasm_detach(w.shmPtr)
	}
}



