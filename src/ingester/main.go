package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

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

	log.Println("[REVELATIO] Ingester] Connected successfully. Streaming records into Cytoplasm III...")

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

			if (action == "create" || action == "")  && event.Commit.Collection == "app.bsky.feed.post" {
				text := event.Commit.Record.Text
				if len(text) == 0 {
					continue
				}

				uri := BuildATURI(event.Did, event.Commit.Collection, event.Commit.RKey)
				author := event.Did
				vector := ExtractFeatureVector(text)

				slotIdx := shmWriter.WritePost(uri, author, text, vector)
				processedCount++

				if processedCount == 1 || processedCount % 100 == 0 {
					log.Printf("[REVELATIO Ingester] Processed %d posts (Row Msgs: %d) | Latest Slot: %d | URI: %s", processedCount, rawMsgCount, slotIdx, uri)
				}
			}
		}
	}()

	select {
	case <- interrupt:
		log.Println("[REVELATIO Ingester] Interruput received. Terminating stream ingestion...")
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		select {
		case <- done:
		case <- time.After(time.Second):
		}
	case <- done:
	}

	log.Println("[REVELATIO Ingester] Shutdown complete.")
}


