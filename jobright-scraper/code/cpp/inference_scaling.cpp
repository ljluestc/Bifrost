#include <iostream>
#include <vector>
#include <string>
#include <queue>
#include <thread>
#include <mutex>
#include <chrono>
#include <atomic>

// Mock Request Structure
struct Request {
    int id;
    std::string payload;
};

// Worker Class simulating an Inference Server
class Worker {
public:
    Worker(int id) : id(id) {}

    void process(const Request& req) {
        // Simulate inference latency
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        std::cout << "[Worker " << id << "] Processed Request " << req.id << std::endl;
    }

private:
    int id;
};

// Aggregator / Load Balancer
class Aggregator {
public:
    Aggregator(int num_workers) {
        for (int i = 0; i < num_workers; ++i) {
            workers.emplace_back(i);
        }
        running = true;
        // Start worker threads (simplified: 1 thread per worker for demo)
        for (int i = 0; i < num_workers; ++i) {
            worker_threads.emplace_back([this, i]() {
                while (running) {
                    Request req;
                    bool has_req = false;
                    
                    {
                        std::unique_lock<std::mutex> lock(queue_mutex);
                        queue_cond.wait(lock, [this] { return !request_queue.empty() || !running; });
                        
                        if (!running && request_queue.empty()) return;
                        
                        if (!request_queue.empty()) {
                            req = request_queue.front();
                            request_queue.pop();
                            has_req = true;
                        }
                    }

                    if (has_req) {
                        workers[i].process(req);
                    }
                }
            });
        }
    }

    ~Aggregator() {
        stop();
    }

    void submit(const Request& req) {
        {
            std::lock_guard<std::mutex> lock(queue_mutex);
            request_queue.push(req);
        }
        queue_cond.notify_one();
    }

    void stop() {
        running = false;
        queue_cond.notify_all();
        for (auto& t : worker_threads) {
            if (t.joinable()) t.join();
        }
    }

private:
    std::vector<Worker> workers;
    std::vector<std::thread> worker_threads;
    std::queue<Request> request_queue;
    std::mutex queue_mutex;
    std::condition_variable queue_cond;
    std::atomic<bool> running;
};

int main() {
    std::cout << "Starting Inference Aggregator..." << std::endl;
    Aggregator lb(4); // 4 Workers

    // Simulate incoming traffic
    for (int i = 0; i < 20; ++i) {
        lb.submit({i, "data"});
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }

    std::this_thread::sleep_for(std::chrono::seconds(3)); // Wait for processing
    std::cout << "Shutting down..." << std::endl;
    return 0;
}
