import { BudgetDeltaWidget } from '@/components/vigia-widgets';

type BudgetData = {
  allocated: number;
  disbursed: number;
  currency: string;
  percentDisbursed: number;
};

export function FinancialBar({ budgetData }: { budgetData?: BudgetData }) {
  if (!budgetData) {
    return (
      <div className="mt-3 text-xs text-text-muted">
        No budget signal available yet.
      </div>
    );
  }

  return (
    <BudgetDeltaWidget
      allocated={budgetData.allocated}
      disbursed={budgetData.disbursed}
      currency={budgetData.currency}
      percentDisbursed={budgetData.percentDisbursed}
    />
  );
}
