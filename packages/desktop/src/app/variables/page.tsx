"use client";

import AssetList from '@/components/AssetList';

export default function VariablesPage() {
  return (
    <AssetList 
      type="variables"
      title="Variables"
      description="Dynamic placeholders for values like User IDs, Product IDs, and Page Paths."
      columns={[
        { header: 'NAME', key: 'name', render: (val) => <span className="font-bold text-slate-100">{val}</span> },
        { header: 'TYPE', key: 'type', render: (val) => <code className="text-indigo-400 text-xs">{val}</code> },
        { header: 'SOURCE', key: 'path', render: (val, row) => val || row.cookieName || row.jsPath || '-' }
      ]}
    />
  );
}
