use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use std::sync::mpsc; // Multi-producer, single-consumer for comparison, but we'll use channel for aggregation

// Mock Request
#[derive(Debug, Clone)]
struct Request {
    id: usize,
    payload: String,
}

// Worker Logic
struct Worker {
    id: usize,
}

impl Worker {
    fn new(id: usize) -> Self {
        Worker { id }
    }

    fn process(&self, req: Request) {
        // Simulate inference work
        thread::sleep(Duration::from_millis(100));
        println!("[Worker {}] Processed Request {}", self.id, req.id);
    }
}

// Aggregator Setup
fn main() {
    let num_workers = 4;
    let (tx, rx) = mpsc::channel::<Request>(); // Channel to send jobs to the pool
    
    // We need a shared receiver? Standard mpsc is single consumer.
    // For a worker pool, we usually use Arc<Mutex<Receiver>> so multiple workers can pop from it.
    let rx = Arc::new(Mutex::new(rx));
    let mut handles = vec![];

    println!("Starting Inference Aggregator (Rust)...");

    // Spawn Workers
    for i in 0..num_workers {
        let rx = Arc::clone(&rx);
        let handle = thread::spawn(move || {
            let worker = Worker::new(i);
            loop {
                // Determine if we should exit (simplified for demo) Or just block
                let req = {
                    let lock = rx.lock().unwrap();
                    lock.recv()
                };

                match req {
                    Ok(r) => worker.process(r),
                    Err(_) => break, // Channel closed
                }
            }
        });
        handles.push(handle);
    }

    // Submit Work
    for i in 0..20 {
        let req = Request { id: i, payload: "data".to_string() };
        tx.send(req).unwrap();
        thread::sleep(Duration::from_millis(20));
    }

    // Stop procedure
    drop(tx); // Close the channel
    
    for h in handles {
        h.join().unwrap();
    }
    
    println!("Shutdown complete.");
}
