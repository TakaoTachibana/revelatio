package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
	"unicode/utf8"
	"strings"

	"github.com/gorilla/websocket"
)

const JetstreamEndpoint = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post"

func main() {
	log.Println("[REVELATIO Ingester] Initializing Cytoplasm III Shared Memory Writer...")

	shmWriter, err := NewSharedMemoryWriter()
	if err != nil {
		log.Fatalf("[FATAL] Failed to initialize shared memory: %v", err)
	}
	defer shmWriter.Close()

	log.Printf("[REVELATIO Ingester] Connecting to Bluesky Jetstream: %s", JetstreamEndpoint)

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)

	conn, _, err := websocket.DefaultDialer.Dial(JetstreamEndpoint, nil)
	if err != nil {
		log.Fatalf("[FATAL] WebSocket Dial error: %v", err)
	}
	defer conn.Close()

	log.Println("[REVELATIO Ingester] Connected successfully. Streaming records into Cytoplasm III...")

	done := make(chan struct{})

	go func() {
		defer close(done)
		var processedCount uint64
		var rawMsgCount uint64

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("[ERROR] WebSocket read error: %v", err)
				return
			}

			rawMsgCount++

			event, err := ParseJetstreamEvent(message)
			if err != nil || event.Kind != "commit" || event.Commit == nil {
				continue
			}

			action := event.Commit.Action
			if action == "" {
				action = event.Commit.Operation
			}

			if (action == "create" || action == "") && event.Commit.Collection == "app.bsky.feed.post" {
				text := event.Commit.Record.Text
				if len(text) == 0 {
					continue
				}

				// 【文字化け対策】2048バイト以内で UTF-8 マルチバイト（日本語・絵文字）の途切れを防止
				safeText := safeTruncateUTF8(text, 2048)
				cleanText := sanitizeText(safeText)

				if len(cleanText) == 0 {
					continue
				}

				uri := BuildATURI(event.Did, event.Commit.Collection, event.Commit.RKey)
				author := event.Did
				vector := ExtractFeatureVector(safeText)

				slotIdx := shmWriter.WritePost(uri, author, safeText, vector)
				processedCount++

				if processedCount == 1 || processedCount%100 == 0 {
					log.Printf("[REVELATIO Ingester] Processed %d posts (Row Msgs: %d) | Latest Slot: %d | URI: %s", processedCount, rawMsgCount, slotIdx, uri)
				}
			}
		}
	}()

	select {
	case <-interrupt:
		log.Println("[REVELATIO Ingester] Interrupt received. Terminating stream ingestion...")
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		select {
		case <-done:
		case <-time.After(time.Second):
		}
	case <-done:
	}

	log.Println("[REVELATIO Ingester] Shutdown complete.")
}

// UTF-8 の文字（Rune）境界を壊さずに maxBytes 以内に収める関数
func safeTruncateUTF8(s string, maxBytes int) string {
	if len(s) <= maxBytes {
		return s
	}
	for maxBytes > 0 && !utf8.RuneStart(s[maxBytes]) {
		maxBytes--
	}
	return s[:maxBytes]
}

// 制御文字（0x00〜0x1F, 0x7Fなど）やバイナリノイズを除去し、
// 表示可能なテキスト・改行・タブのみを抽出する関数
func sanitizeText(s string) string {
	var b strings.Builder
	b.Grow(len(s))

	for _, r := range s {
		// 表示可能文字（0x20以上かつDEL文字0x7F以外）、または改行(\n)・復帰(\r)・タブ(\t)のみを保持
		if (r >= 0x20 && r != 0x7F) || r == '\n' || r == '\r' || r == '\t' {
			b.WriteRune(r)
		}
	}

	return strings.TrimSpace(b.String())
}
