"use client";

import AssetList from '@/components/AssetList';

export default function ZonesPage() {
  return (
    <AssetList 
      type="zones"
      title="Zones"
      description="Group URL patterns to target specific sections of your site."
      columns={[
        { header: 'NAME', key: 'name', render: (val) => <span className="font-bold text-slate-100">{val}</span> },
        { 
          header: 'PATTERNS', 
          key: 'patterns', 
          render: (val) => (
            <div className="flex gap-2 flex-wrap">
              {val?.map((p: string, i: number) => (
                <code key={i} className="text-[10px] bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded text-slate-400">{p}</code>
              ))}
            </div>
          ) 
        }
      ]}
    />
  );
}
