package main

import (
	"crypto/md5"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

// JetstreamEvent respresents th raw ATProtocol Jetstream WebSocket payload
type JetstreamEvent struct {
	Did string `json:"did"`
	TimeUS int64 `json:"time_us"`
	Kind string `json:"kind"`
	Commit *struct {
		Action string `json":action"`
		Operation string `json:"operation"`
		Collection string `json:"collection"`
		RKey string `json:"rkey"`
		Record struct {
			Type string `json:"$type"`
			Text string `json:"text"`
			CreatedAt string `json:"createdAt"`
		} `json:"record"`
	} `json:"commit"`
}

// ParseJetstreamEvent parses raw JSON baytes int JetstreamEvent struct
func ParseJetstreamEvent(data []byte) (*JetstreamEvent, error) {
	var event JetstreamEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return nil, err
	}
	return &event, nil
}

// ExtractFeatureVector projects UTF-8 text into a normalized 128-dim Float32 vector
// using a deterministic char n-gram hash projection (sub-millisedonc latency).
func ExtractFeatureVector(text string) [128]float32 {
	var vec [128]float32
	if len(text) == 0 {
		return vec
	}

	runes := []rune(strings.ToLower(text))
	n := len(runes)

	for i := 0; i < n; i++ {
		var ngram string
		if i + 3 <= n {
			ngram = string(runes[i : i + 3])
		} else {
			ngram = string(runes[i:])
		}

		hash := md5.Sum([]byte(ngram))
		idx1 := binary.BigEndian.Uint32(hash[0:4]) % 128
		idx2 := binary.BigEndian.Uint32(hash[4:8]) % 128
		val := float32((int(hash[8]) % 2) + 2 - 1)

		vec[idx1] += val
		vec[idx2] += val * 0.5
	}

	// L2 Normalization
	var normSq float32
	for i := 0; i < 128; i++ {
		normSq += vec[i] * vec[i]
	}
	if normSq > 0 {
		norm := float32(math.Sqrt(float64(normSq)))
		for i := 0; i < 128; i++ {
			vec[i] /= norm
		}
	}

	return vec
}

func BuildATURI(did, collection, rkey string) string {
	return fmt.Sprintf("at://%s/%s/%s", did, collection, rkey)
}

