"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus } from 'lucide-react';

interface AssetListProps {
  type: 'triggers' | 'variables' | 'zones';
  title: string;
  description: string;
  columns: { header: string; key: string; render?: (val: any, row: any) => React.ReactNode }[];
}

export default function AssetListPage({ type, title, description, columns }: AssetListProps) {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/project')
      .then(res => res.json())
      .then(data => {
        setAssets(data[type] || []);
        setLoading(false);
      })
      .catch(console.error);
  }, [type]);

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">{title}</h1>
          <p className="text-slate-400 mt-1">{description}</p>
        </div>
        <button className="px-4 py-2 rounded-md font-semibold text-sm bg-sky-400 text-slate-950 hover:bg-sky-500 transition-colors flex items-center gap-2">
          <Plus size={18} /> New {title.slice(0, -1)}
        </button>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-800/80">
            <tr>
              {columns.map((col, i) => (
                <th key={i} className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700 uppercase tracking-wider">
                  {col.header}
                </th>
              ))}
              <th className="p-4 border-b border-slate-700"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-12 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="animate-spin" size={20} /> Loading {type}...
                  </div>
                </td>
              </tr>
            ) : assets.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-12 text-center text-slate-500">
                  No {type} found in this project.
                </td>
              </tr>
            ) : (
              assets.map((asset, idx) => (
                <Link key={idx} href={`/${type}/${asset.id || asset.name}`} legacyBehavior>
                  <tr className="hover:bg-slate-700/20 transition-colors cursor-pointer group">
                    {columns.map((col, i) => (
                      <td key={i} className="p-4 text-slate-300">
                        {col.render ? col.render(asset[col.key], asset) : (asset[col.key] || '-')}
                      </td>
                    ))}
                    <td className="p-4 text-right text-slate-500 group-hover:text-sky-400 transition-colors">
                      Edit →
                    </td>
                  </tr>
                </Link>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
