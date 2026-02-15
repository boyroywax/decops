import { useState } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Group, GroupForm } from "../types";

export function useGroups(addJob: (job: any) => void) {
    const [groups, setGroups] = useLocalStorage<Group[]>("decops_groups", []);

    // UI State
    const [showGroupCreate, setShowGroupCreate] = useState(false);
    const [groupForm, setGroupForm] = useState<GroupForm>({ name: "", governance: "majority", members: [], threshold: 2 });
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [broadcastGroup, setBroadcastGroup] = useState<string | null>(null);

    const createGroup = () => {
        if (!groupForm.name.trim() || groupForm.members.length < 2) return;
        addJob({
            type: "create_group",
            request: {
                name: groupForm.name.trim(),
                members: groupForm.members,
                governance: groupForm.governance
            }
        });
        setGroupForm({ name: "", governance: "majority", members: [], threshold: 2 });
        setShowGroupCreate(false);
    };

    const removeGroup = (id: string) => {
        addJob({ type: "delete_group", request: { id } });
        if (selectedGroup === id) setSelectedGroup(null);
    };

    const removeGroups = (ids: Set<string>) => {
        addJob({ type: "bulk_delete", request: { type: "groups", ids: Array.from(ids) } });
        if (selectedGroup && ids.has(selectedGroup)) setSelectedGroup(null);
    };

    const toggleGroupMember = (agentId: string) => {
        setGroupForm((prev) => ({
            ...prev,
            members: prev.members.includes(agentId)
                ? prev.members.filter((m) => m !== agentId)
                : [...prev.members, agentId],
        }));
    };

    return {
        groups, setGroups,
        showGroupCreate, setShowGroupCreate,
        groupForm, setGroupForm,
        selectedGroup, setSelectedGroup,
        broadcastGroup, setBroadcastGroup,
        createGroup, removeGroup, removeGroups, toggleGroupMember
    };
}
