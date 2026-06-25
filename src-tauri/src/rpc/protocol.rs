use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── RPC Commands (sent to pi's stdin) ──

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum RpcCommand {
    Prompt(PromptCommand),
    Steer(SteerCommand),
    FollowUp(FollowUpCommand),
    Abort(AbortCommand),
    GetState(GetStateCommand),
    GetMessages(GetMessagesCommand),
    SetModel(SetModelCommand),
    CycleModel(CycleModelCommand),
    GetAvailableModels(GetAvailableModelsCommand),
    SetThinkingLevel(SetThinkingLevelCommand),
    NewSession(NewSessionCommand),
    SwitchSession(SwitchSessionCommand),
    Fork(ForkCommand),
    GetSessionStats(GetSessionStatsCommand),
    ListSessions(ListSessionsCommand),
    Compact(CompactCommand),
    SetAutoCompaction(SetAutoCompactionCommand),
    Bash(BashCommand),
}

macro_rules! rpc_command {
    ($name:ident { $($(#[$meta:meta])* $field:ident: $ty:ty),* $(,)? }) => {
        #[derive(Debug, Serialize)]
        pub struct $name {
            pub r#type: String,
            pub id: String,
            $( $(#[$meta])* pub $field: $ty,)*
        }

        impl $name {
            pub fn new(id: impl Into<String>) -> Self {
                Self {
                    r#type: stringify!($name).to_lowercase(),
                    id: id.into(),
                    $($field: Default::default(),)*
                }
            }
        }
    };
    ($name:ident { $($(#[$meta:meta])* $field:ident: $ty:ty),* $(,)? }, $type_str:expr) => {
        #[derive(Debug, Serialize)]
        pub struct $name {
            pub r#type: String,
            pub id: String,
            $( $(#[$meta])* pub $field: $ty,)*
        }

        impl $name {
            pub fn new(id: impl Into<String>) -> Self {
                Self {
                    r#type: $type_str.to_string(),
                    id: id.into(),
                    $($field: Default::default(),)*
                }
            }
        }
    };
}

// Prompt with optional images
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptCommand {
    pub r#type: String,
    pub id: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<ImageContent>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streaming_behavior: Option<String>,
}

impl PromptCommand {
    pub fn new(id: impl Into<String>, message: String) -> Self {
        Self {
            r#type: "prompt".into(),
            id: id.into(),
            message,
            images: None,
            streaming_behavior: None,
        }
    }

    pub fn with_steer(mut self) -> Self {
        self.streaming_behavior = Some("steer".into());
        self
    }

    pub fn with_follow_up(mut self) -> Self {
        self.streaming_behavior = Some("followUp".into());
        self
    }

    pub fn with_images(mut self, images: Vec<ImageContent>) -> Self {
        self.images = Some(images);
        self
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteerCommand {
    pub r#type: String,
    pub id: String,
    pub message: String,
}

impl SteerCommand {
    pub fn new(id: impl Into<String>, message: String) -> Self {
        Self {
            r#type: "steer".into(),
            id: id.into(),
            message,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowUpCommand {
    pub r#type: String,
    pub id: String,
    pub message: String,
}

impl FollowUpCommand {
    pub fn new(id: impl Into<String>, message: String) -> Self {
        Self {
            r#type: "follow_up".into(),
            id: id.into(),
            message,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageContent {
    pub r#type: String,
    pub data: String,
    pub mime_type: String,
}

// Simple commands
rpc_command!(AbortCommand {}, "abort");
rpc_command!(GetStateCommand {}, "get_state");
rpc_command!(GetMessagesCommand {}, "get_messages");
rpc_command!(CycleModelCommand {}, "cycle_model");
rpc_command!(GetAvailableModelsCommand {}, "get_available_models");
rpc_command!(NewSessionCommand {
    #[serde(skip_serializing_if = "Option::is_none", rename = "parentSession")]
    parent_session: Option<String>,
}, "new_session");
rpc_command!(GetSessionStatsCommand {}, "get_session_stats");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetModelCommand {
    pub r#type: String,
    pub id: String,
    pub provider: String,
    pub model_id: String,
}

impl SetModelCommand {
    pub fn new(id: impl Into<String>, provider: String, model_id: String) -> Self {
        Self {
            r#type: "set_model".into(),
            id: id.into(),
            provider,
            model_id,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetThinkingLevelCommand {
    pub r#type: String,
    pub id: String,
    pub level: String,
}

impl SetThinkingLevelCommand {
    pub fn new(id: impl Into<String>, level: String) -> Self {
        Self {
            r#type: "set_thinking_level".into(),
            id: id.into(),
            level,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchSessionCommand {
    pub r#type: String,
    pub id: String,
    pub session_path: String,
}

impl SwitchSessionCommand {
    pub fn new(id: impl Into<String>, session_path: String) -> Self {
        Self {
            r#type: "switch_session".into(),
            id: id.into(),
            session_path,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkCommand {
    pub r#type: String,
    pub id: String,
    pub entry_id: String,
}

impl ForkCommand {
    pub fn new(id: impl Into<String>, entry_id: String) -> Self {
        Self {
            r#type: "fork".into(),
            id: id.into(),
            entry_id,
        }
    }
}

// Simple commands
rpc_command!(ListSessionsCommand {}, "list_sessions");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactCommand {
    pub r#type: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_instructions: Option<String>,
}

impl CompactCommand {
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            r#type: "compact".into(),
            id: id.into(),
            custom_instructions: None,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAutoCompactionCommand {
    pub r#type: String,
    pub id: String,
    pub enabled: bool,
}

impl SetAutoCompactionCommand {
    pub fn new(id: impl Into<String>, enabled: bool) -> Self {
        Self {
            r#type: "set_auto_compaction".into(),
            id: id.into(),
            enabled,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BashCommand {
    pub r#type: String,
    pub id: String,
    pub command: String,
}

impl BashCommand {
    pub fn new(id: impl Into<String>, command: String) -> Self {
        Self {
            r#type: "bash".into(),
            id: id.into(),
            command,
        }
    }
}

// ── RPC Responses (from pi's stdout) ──

#[derive(Debug, Deserialize)]
pub struct RpcResponse {
    #[serde(default)]
    pub id: Option<String>,
    pub r#type: String,
    pub command: Option<String>,
    pub success: Option<bool>,
    pub error: Option<String>,
    pub data: Option<Value>,
}

// ── RPC Events (from pi's stdout) ──

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum RpcEvent {
    #[serde(rename = "agent_start")]
    AgentStart,
    #[serde(rename = "agent_end")]
    AgentEnd {
        messages: Option<Vec<Value>>,
    },
    #[serde(rename = "turn_start")]
    TurnStart,
    #[serde(rename = "turn_end")]
    TurnEnd {
        message: Option<Value>,
        #[serde(default)]
        tool_results: Vec<Value>,
    },
    #[serde(rename = "message_start")]
    MessageStart {
        message: Option<Value>,
    },
    #[serde(rename = "message_update")]
    MessageUpdate {
        message: Option<Value>,
        #[serde(default)]
        assistant_message_event: Option<AssistantMessageEvent>,
    },
    #[serde(rename = "message_end")]
    MessageEnd {
        message: Option<Value>,
    },
    #[serde(rename = "tool_execution_start")]
    ToolExecutionStart {
        tool_call_id: String,
        tool_name: String,
        args: Value,
    },
    #[serde(rename = "tool_execution_update")]
    ToolExecutionUpdate {
        tool_call_id: String,
        tool_name: String,
        args: Value,
        partial_result: Option<Value>,
    },
    #[serde(rename = "tool_execution_end")]
    ToolExecutionEnd {
        tool_call_id: String,
        tool_name: String,
        result: Option<Value>,
        is_error: Option<bool>,
    },
    #[serde(rename = "queue_update")]
    QueueUpdate {
        steering: Vec<String>,
        follow_up: Vec<String>,
    },
    #[serde(rename = "compaction_start")]
    CompactionStart {
        reason: Option<String>,
    },
    #[serde(rename = "compaction_end")]
    CompactionEnd {
        reason: Option<String>,
        result: Option<Value>,
        aborted: Option<bool>,
        will_retry: Option<bool>,
        error_message: Option<String>,
    },
    #[serde(rename = "auto_retry_start")]
    AutoRetryStart {
        attempt: u32,
        max_attempts: u32,
        delay_ms: u64,
        error_message: String,
    },
    #[serde(rename = "auto_retry_end")]
    AutoRetryEnd {
        success: bool,
        attempt: u32,
        final_error: Option<String>,
    },
    #[serde(rename = "extension_ui_request")]
    ExtensionUiRequest {
        id: String,
        method: String,
        title: Option<String>,
        message: Option<String>,
        options: Option<Vec<String>>,
        placeholder: Option<String>,
        prefill: Option<String>,
        notify_type: Option<String>,
        status_key: Option<String>,
        status_text: Option<String>,
        widget_key: Option<String>,
        widget_lines: Option<Vec<String>>,
        widget_placement: Option<String>,
        timeout: Option<u64>,
    },
    #[serde(rename = "response")]
    Response {
        id: Option<String>,
        command: Option<String>,
        success: Option<bool>,
        error: Option<String>,
        data: Option<Value>,
    },
    #[serde(rename = "extension_error")]
    ExtensionError {
        extension_path: Option<String>,
        event: Option<String>,
        error: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
pub struct AssistantMessageEvent {
    pub r#type: String,
    #[serde(default)]
    pub delta: Option<String>,
    #[serde(default)]
    pub content_index: Option<u32>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub partial: Option<Value>,
    #[serde(default)]
    pub tool_call: Option<Value>,
}

// ── Extension UI Response (sent to pi's stdin) ──

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionUiResponse {
    pub r#type: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirmed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled: Option<bool>,
}
