import { Check, X } from 'lucide-react';
import { HECard } from './DesignSystem';

export function PlanComparison() {
  const features = [
    {
      category: 'Core Features',
      items: [
        { name: 'Users', beta: '1', starter: '1', growth: '1', team: 'Up to 10' },
        { name: 'Businesses/Brands', beta: '1', starter: '1', growth: '1', team: 'Multiple' },
        { name: 'Connected Accounts', beta: '3', starter: '3', growth: '5', team: 'Unlimited' },
        { name: 'Calendar & Scheduling', beta: true, starter: true, growth: true, team: true },
        { name: 'Daily Cues', beta: true, starter: true, growth: true, team: true },
        { name: 'Opportunities Tracking', beta: true, starter: true, growth: true, team: true },
        { name: 'Territories Tracker', beta: true, starter: true, growth: true, team: true },
        { name: 'Notes', beta: true, starter: true, growth: true, team: true },
        { name: 'Facebook Keyword Tracking', beta: true, starter: false, growth: true, team: true },
      ],
    },
    {
      category: 'AI Features',
      items: [
        { name: 'AI Rewrites', beta: '10/mo', starter: '10/mo', growth: 'Unlimited', team: 'Unlimited' },
        { name: 'Daily Cue Suggestions', beta: false, starter: false, growth: true, team: true },
        { name: 'Post Adaptation', beta: false, starter: false, growth: true, team: true },
        { name: 'Priority AI Processing', beta: false, starter: false, growth: true, team: true },
      ],
    },
    {
      category: 'Analytics & Reporting',
      items: [
        { name: 'Basic Analytics', beta: true, starter: true, growth: true, team: true },
        { name: 'Advanced Reporting', beta: false, starter: false, growth: true, team: true },
        { name: 'Failed/Denied Post Tracking', beta: false, starter: false, growth: true, team: true },
        { name: 'White-label Reporting', beta: false, starter: false, growth: false, team: true },
      ],
    },
    {
      category: 'Team Features',
      items: [
        { name: 'Shared Notes', beta: false, starter: false, growth: false, team: true },
        { name: 'Team Cues', beta: false, starter: false, growth: false, team: true },
        { name: 'Approval Workflows', beta: false, starter: false, growth: false, team: true },
        { name: 'Role-based Permissions', beta: false, starter: false, growth: false, team: true },
      ],
    },
    {
      category: 'Support',
      items: [
        { name: 'Email Support', beta: true, starter: true, growth: true, team: true },
        { name: 'Priority Support', beta: true, starter: false, growth: true, team: true },
        { name: 'Dedicated Account Manager', beta: false, starter: false, growth: false, team: true },
      ],
    },
  ];

  const renderCell = (value: string | boolean) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check className="w-5 h-5 text-[#22C55E] mx-auto" />
      ) : (
        <X className="w-5 h-5 text-[#64748B] mx-auto opacity-30" />
      );
    }
    return <span className="text-sm text-[#0F172A]">{value}</span>;
  };

  return (
    <div className="overflow-x-auto pb-20">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-[#E2E8F0]">
            <th className="text-left p-3 text-sm font-semibold text-[#0F172A]">Feature</th>
            <th className="p-3 text-sm font-semibold text-[#F59E0B]">Beta</th>
            <th className="p-3 text-sm font-semibold text-[#1D4ED8]">Starter</th>
            <th className="p-3 text-sm font-semibold text-[#22C55E]">Growth</th>
            <th className="p-3 text-sm font-semibold text-[#8B5CF6]">Team</th>
          </tr>
        </thead>
        <tbody>
          {features.map((category, idx) => (
            <>
              <tr key={`cat-${idx}`} className="bg-[#F8FAFC]">
                <td colSpan={5} className="p-3 text-sm font-semibold text-[#0F172A]">
                  {category.category}
                </td>
              </tr>
              {category.items.map((item, itemIdx) => (
                <tr key={`item-${idx}-${itemIdx}`} className="border-b border-[#E2E8F0]">
                  <td className="p-3 text-sm text-[#0F172A]">{item.name}</td>
                  <td className="p-3 text-center">{renderCell(item.beta)}</td>
                  <td className="p-3 text-center">{renderCell(item.starter)}</td>
                  <td className="p-3 text-center">{renderCell(item.growth)}</td>
                  <td className="p-3 text-center">{renderCell(item.team)}</td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
