use crate::rpc::client::PiRpcClient;
use std::sync::Mutex;

pub struct AppState {
    pub rpc: Mutex<PiRpcClient>,
}
