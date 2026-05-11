                        style={activeAgent ? {
                            ["--agent-gradient-start" as any]: activeAgent.gradient?.[0] ?? "#38bdf8",
                            ["--agent-gradient-end" as any]: activeAgent.gradient?.[1] ?? "#a78bfa",
                        } : undefined}
                    >
                    {activeAgent?.icon && (
                        <button
                            type="button"
                            className="chat-panel__agent-input-badge"
                            onClick={() => useChatAgentsStore.getState().setActive(null)}
                            title={`${activeAgent.name} is handling your prompts — click to exit agent mode`}
                        >
                            <GradientIcon
                                icon={activeAgent.icon as any}
                                size={13}
                                gradient={activeAgent.gradient ?? ["#38bdf8", "#a78bfa"]}
                            />
                        </button>
                    )}
                    {studioAvailable && !activeAgent && (
                        <button
                            className={`chat-panel__studio-input-badge${!studioMode ? " chat-panel__studio-input-badge--off" : ""}`}
                            onClick={() => setStudioMode(prev => !prev)}
                            title={studioMode ? "Studio mode active — click to disable (⌘J)" : "Studio mode disabled — click to enable (⌘J)"}
                        >
                            <Clapperboard size={13} />
                        </button>
                    )}
                    {editorAvailable && !studioAvailable && !activeAgent && (
                        <button
                            className={`chat-panel__editor-input-badge${!editorMode ? " chat-panel__editor-input-badge--off" : ""}`}
                            onClick={() => setEditorMode(prev => !prev)}
                            title={editorMode ? "Editor mode active — click to disable" : "Editor mode disabled — click to enable"}
                        >
                            <Edit3 size={13} />
                        </button>
                    )}
                    <input
                        ref={inputRef}
