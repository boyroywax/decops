import { useState, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import type { Workspace, WorkspaceMetadata } from '../types';

const STORAGE_PREFIX = 'decops_workspace_';
const METADATA_KEY = 'decops_workspaces_metadata';
const ACTIVE_WORKSPACE_KEY = 'decops_active_workspace';

export function useWorkspaceManager() {
    const [workspaces, setWorkspaces] = useLocalStorage<WorkspaceMetadata[]>(METADATA_KEY, []);
    const [activeWorkspaceId, setActiveWorkspaceId] = useLocalStorage<string | null>(ACTIVE_WORKSPACE_KEY, null);

    // Ensure at least one workspace exists on first load
    useEffect(() => {
        if (workspaces.length === 0) {
            const defaultId = crypto.randomUUID();
            const defaultWorkspace: WorkspaceMetadata = {
                id: defaultId,
                name: 'Default Workspace',
                created: Date.now(),
                lastModified: Date.now(),
            };
            setWorkspaces([defaultWorkspace]);
            setActiveWorkspaceId(defaultId);
            // We don't save the full object here, relies on the app to save state when it changes or on demand? 
            // Actually, if we are "loading" a workspace, we expect data to be there. 
            // So if we create a default one, we should probably initialize its data too.
            // But since this hook doesn't know about agents/channels, it strictly manages the "Blobs". 
            // The Context will handle the "Default" state if nothing is loaded.
        }
    }, [workspaces, setWorkspaces, setActiveWorkspaceId]);

    const createWorkspace = (name: string, description?: string): Workspace => {
        const newId = crypto.randomUUID();
        const metadata: WorkspaceMetadata = {
            id: newId,
            name,
            description,
            created: Date.now(),
            lastModified: Date.now(),
        };

        const newWorkspace: Workspace = {
            metadata,
            agents: [],
            channels: [],
            groups: [],
            messages: [],
        };

        setWorkspaces(prev => [...prev, metadata]);
        saveWorkspace(newWorkspace); // Save initial empty state (don't auto-switch)
        return newWorkspace;
    };

    const saveWorkspace = (workspace: Workspace) => {
        const key = `${STORAGE_PREFIX}${workspace.metadata.id}`;
        localStorage.setItem(key, JSON.stringify(workspace));

        // Update metadata lastModified and stats
        setWorkspaces(prev => prev.map(w =>
            w.id === workspace.metadata.id
                ? {
                    ...w,
                    lastModified: Date.now(),
                    name: workspace.metadata.name,
                    description: workspace.metadata.description,
                    stats: {
                        agentCount: workspace.agents.length,
                        channelCount: workspace.channels.length,
                        groupCount: workspace.groups.length,
                        networkCount: (workspace as any).ecosystems?.length || 0 // Cast as generic or update Type if ecosystems is missing from Workspace interface
                    }
                }
                : w
        ));
    };

    const loadWorkspace = (id: string): Workspace | null => {
        const key = `${STORAGE_PREFIX}${id}`;
        const data = localStorage.getItem(key);
        if (data) {
            try {
                return JSON.parse(data) as Workspace;
            } catch (e) {
                console.error("Failed to parse workspace data", e);
                return null;
            }
        }
        return null; // Or return default empty if not found?
    };

    const deleteWorkspace = (id: string) => {
        const key = `${STORAGE_PREFIX}${id}`;
        localStorage.removeItem(key);
        setWorkspaces(prev => prev.filter(w => w.id !== id));
        if (activeWorkspaceId === id) {
            setActiveWorkspaceId(null);
        }
    };

    const duplicateWorkspace = (sourceId: string, name?: string): string => {
        const sourceWorkspace = loadWorkspace(sourceId);
        if (!sourceWorkspace) {
            throw new Error(`Source workspace ${sourceId} not found`);
        }

        const newId = crypto.randomUUID();
        const newName = name || `Copy of ${sourceWorkspace.metadata.name}`;

        const newMetadata: WorkspaceMetadata = {
            ...sourceWorkspace.metadata,
            id: newId,
            name: newName,
            created: Date.now(),
            lastModified: Date.now()
        };

        const newWorkspace: Workspace = {
            ...sourceWorkspace,
            metadata: newMetadata
        };

        // Save new workspace
        const key = `${STORAGE_PREFIX}${newId}`;
        localStorage.setItem(key, JSON.stringify(newWorkspace));

        setWorkspaces(prev => [...prev, newMetadata]);

        return newId;
    };

    const importWorkspace = (fileMatches: FileList | null) => {
        // This would handle file reading, parsing JSON, and then calling create/save
        // We can implement this in the UI component or return a helper here.
    };

    return {
        workspaces,
        activeWorkspaceId,
        setActiveWorkspaceId,
        createWorkspace,
        saveWorkspace,
        loadWorkspace,
        deleteWorkspace,
        duplicate: duplicateWorkspace
    };
}
