"use client";

import AssetList from '@/components/AssetList';

export default function TriggersPage() {
  return (
    <AssetList 
      type="triggers"
      title="Triggers"
      description="Define when your tags should fire based on user interactions."
      columns={[
        { header: 'NAME', key: 'name', render: (val) => <span className="font-bold text-slate-100">{val}</span> },
        { header: 'TYPE', key: 'type', render: (val) => <code className="text-sky-400 text-xs">{val}</code> },
        { 
          header: 'STATUS', 
          key: 'enabled', 
          render: (val) => (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${val !== false ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-700 text-slate-400'}`}>
              {val !== false ? 'Active' : 'Paused'}
            </span>
          ) 
        }
      ]}
    />
  );
}
