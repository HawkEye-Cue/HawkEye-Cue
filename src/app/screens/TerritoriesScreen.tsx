import { useState } from 'react';
import { HEButton, HECard, HEInput } from '../components/DesignSystem';
import { tradeContent } from '../data/tradeData';
import { Edit2, Check, X, Trash2, Plus } from 'lucide-react';

interface TerritoriesScreenProps {
  tradeId: string;
  onNavigate: (page: string) => void;
}

interface CustomTerritory {
  name: string;
  allowed: string;
  rules: string;
  nextPost: string;
}

export function TerritoriesScreen({ tradeId, onNavigate }: TerritoriesScreenProps) {
  const content = tradeContent[tradeId];
  const [territories, setTerritories] = useState<CustomTerritory[]>(
    content.territories.map(t => ({ ...t }))
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedAllowed, setEditedAllowed] = useState('');
  const [editedRules, setEditedRules] = useState('');
  const [showAddNew, setShowAddNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAllowed, setNewAllowed] = useState('');
  const [newRules, setNewRules] = useState('');

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditedName(territories[index].name);
    setEditedAllowed(territories[index].allowed);
    setEditedRules(territories[index].rules);
  };

  const saveEdits = (index: number) => {
    const updated = [...territories];
    updated[index] = {
      ...updated[index],
      name: editedName,
      allowed: editedAllowed,
      rules: editedRules,
    };
    setTerritories(updated);
    setEditingIndex(null);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditedName('');
    setEditedAllowed('');
    setEditedRules('');
  };

  const addNewTerritory = () => {
    if (newName.trim()) {
      const newTerritory: CustomTerritory = {
        name: newName,
        allowed: newAllowed || 'Any day',
        rules: newRules || 'No specific rules',
        nextPost: 'Not scheduled',
      };
      setTerritories([...territories, newTerritory]);
      setShowAddNew(false);
      setNewName('');
      setNewAllowed('');
      setNewRules('');
    }
  };

  const deleteTerritory = (index: number) => {
    if (confirm(`Delete "${territories[index].name}"?`)) {
      setTerritories(territories.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#0F172A]">Territories</h1>
        <p className="text-xs text-[#64748B]">Click ✏️ to edit</p>
      </div>

      {territories.map((territory, idx) => (
        <HECard key={idx}>
          {editingIndex === idx ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  Group/Territory Name
                </label>
                <HEInput
                  value={editedName}
                  onChange={setEditedName}
                  placeholder="e.g., Brighton Moms Group"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  Allowed Days
                </label>
                <HEInput
                  value={editedAllowed}
                  onChange={setEditedAllowed}
                  placeholder="e.g., Monday, Wednesday, Friday"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  Posting Rules
                </label>
                <HEInput
                  value={editedRules}
                  onChange={setEditedRules}
                  placeholder="e.g., No links, value only"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <HEButton
                  variant="primary"
                  onClick={() => saveEdits(idx)}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Save
                </HEButton>
                <HEButton
                  variant="secondary"
                  onClick={cancelEditing}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </HEButton>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-2">
                <h2 className="text-lg font-semibold text-[#0F172A] flex-1">
                  {territory.name}
                </h2>
                <div className="flex gap-1">
                  <button
                    onClick={() => startEditing(idx)}
                    className="p-2 hover:bg-[#F1F5F9] rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-[#64748B]" />
                  </button>
                  <button
                    onClick={() => deleteTerritory(idx)}
                    className="p-2 hover:bg-[#FEE2E2] rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-[#EF4444]" />
                  </button>
                </div>
              </div>
              <p className="text-base text-[#64748B] mb-1">
                Allowed: {territory.allowed}
              </p>
              <p className="text-base text-[#64748B] mb-1">
                Rules: {territory.rules}
              </p>
              <p className="text-xs text-[#1D4ED8] mt-2">
                Next Post: {territory.nextPost}
              </p>
            </>
          )}
        </HECard>
      ))}

      {showAddNew && (
        <HECard className="border-2 border-[#1D4ED8]">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-3">Add New Territory</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">
                Group/Territory Name *
              </label>
              <HEInput
                value={newName}
                onChange={setNewName}
                placeholder="e.g., Local Moms & Business Owners"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">
                Allowed Days
              </label>
              <HEInput
                value={newAllowed}
                onChange={setNewAllowed}
                placeholder="e.g., Monday, Wednesday, Friday"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">
                Posting Rules
              </label>
              <HEInput
                value={newRules}
                onChange={setNewRules}
                placeholder="e.g., Helpful content only, no spam"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <HEButton
                variant="primary"
                onClick={addNewTerritory}
                className="flex-1 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Add Territory
              </HEButton>
              <HEButton
                variant="secondary"
                onClick={() => {
                  setShowAddNew(false);
                  setNewName('');
                  setNewAllowed('');
                  setNewRules('');
                }}
                className="flex-1 flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </HEButton>
            </div>
          </div>
        </HECard>
      )}

      <HEButton
        variant="primary"
        onClick={() => setShowAddNew(true)}
        className="flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Add Territory
      </HEButton>
    </div>
  );
}
