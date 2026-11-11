"use client";

import Link from 'next/link';
import { Tag, Zap, Map, Database, ArrowRight } from 'lucide-react';

const assetTypes = [
  {
    type: 'tag',
    title: 'New Tag',
    description: 'Create a tracking tag from a template. GA4, Meta Pixel, TikTok, and more.',
    icon: Tag,
    color: 'sky',
    href: '/create/tag',
  },
  {
    type: 'trigger',
    title: 'New Trigger',
    description: 'Define when tags should fire. Page views, clicks, scroll depth, custom events.',
    icon: Zap,
    color: 'amber',
    href: '/create/trigger',
  },
  {
    type: 'zone',
    title: 'New Zone',
    description: 'Create URL-based groupings. Control where tags fire by page patterns.',
    icon: Map,
    color: 'emerald',
    href: '/create/zone',
  },
  {
    type: 'variable',
    title: 'New Variable',
    description: 'Define reusable values. DataLayer, cookies, localStorage, or custom JavaScript.',
    icon: Database,
    color: 'purple',
    href: '/create/variable',
  },
];

const colorClasses: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  sky: {
    bg: 'hover:bg-sky-400/5',
    border: 'border-sky-400/20 hover:border-sky-400/40',
    text: 'text-sky-400',
    iconBg: 'bg-sky-400/10',
  },
  amber: {
    bg: 'hover:bg-amber-400/5',
    border: 'border-amber-400/20 hover:border-amber-400/40',
    text: 'text-amber-400',
    iconBg: 'bg-amber-400/10',
  },
  emerald: {
    bg: 'hover:bg-emerald-400/5',
    border: 'border-emerald-400/20 hover:border-emerald-400/40',
    text: 'text-emerald-400',
    iconBg: 'bg-emerald-400/10',
  },
  purple: {
    bg: 'hover:bg-purple-400/5',
    border: 'border-purple-400/20 hover:border-purple-400/40',
    text: 'text-purple-400',
    iconBg: 'bg-purple-400/10',
  },
};

export default function CreatePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100">Create New Asset</h1>
        <p className="text-slate-400 mt-1">
          Choose what type of asset you want to create for your tag manager container.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {assetTypes.map((asset) => {
          const colors = colorClasses[asset.color];
          const Icon = asset.icon;

          return (
            <Link
              key={asset.type}
              href={asset.href}
              className={`
                group p-6 rounded-xl border transition-all duration-200
                bg-slate-800/30 ${colors.border} ${colors.bg}
              `}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${colors.iconBg}`}>
                  <Icon className={colors.text} size={24} />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-slate-100 mb-2 flex items-center gap-2">
                    {asset.title}
                    <ArrowRight
                      className={`${colors.text} opacity-0 group-hover:opacity-100 transition-opacity`}
                      size={18}
                    />
                  </h2>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    {asset.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-12 p-6 bg-slate-800/30 border border-slate-700/50 rounded-xl">
        <h3 className="text-lg font-semibold text-slate-100 mb-2">Need help choosing?</h3>
        <ul className="text-slate-400 text-sm space-y-2">
          <li>
            <span className="text-sky-400 font-medium">Tags</span> are your tracking pixels (GA4, Meta, TikTok, etc.) - they send data to platforms.
          </li>
          <li>
            <span className="text-amber-400 font-medium">Triggers</span> determine when tags fire (page load, clicks, form submissions, etc.).
          </li>
          <li>
            <span className="text-emerald-400 font-medium">Zones</span> define where tags fire using URL patterns (product pages, checkout, etc.).
          </li>
          <li>
            <span className="text-purple-400 font-medium">Variables</span> are reusable values like user IDs, page categories, or custom data.
          </li>
        </ul>
      </div>
    </div>
  );
}
