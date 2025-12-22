import { cn } from '@/lib/utils';

interface CalculatorButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'operator' | 'equals' | 'function';
  span?: 2;
}

export const CalculatorButton = ({
  children,
  onClick,
  variant = 'default',
  span,
}: CalculatorButtonProps) => {
  const baseStyles = 
    'flex items-center justify-center text-xl font-medium rounded-xl transition-all duration-150 active:animate-button-press select-none';
  
  const variantStyles = {
    default: 'bg-calc-button hover:bg-calc-button-hover active:bg-calc-button-active text-foreground',
    operator: 'bg-calc-operator hover:bg-calc-operator-hover text-foreground',
    equals: 'bg-calc-equals hover:bg-calc-equals-hover text-accent-foreground',
    function: 'bg-calc-operator hover:bg-calc-operator-hover text-foreground text-lg',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        baseStyles,
        variantStyles[variant],
        span === 2 ? 'col-span-2' : '',
        'h-16 sm:h-18'
      )}
    >
      {children}
    </button>
  );
};
