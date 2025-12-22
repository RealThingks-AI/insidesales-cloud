interface CalculatorDisplayProps {
  value: string;
}

export const CalculatorDisplay = ({ value }: CalculatorDisplayProps) => {
  // Format the display value for better readability
  const formatDisplay = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    
    // If it's a very long number, use exponential notation
    if (val.length > 12) {
      return num.toExponential(6);
    }
    return val;
  };

  const displayValue = formatDisplay(value);
  
  // Adjust font size based on content length
  const getFontSize = () => {
    if (displayValue.length > 10) return 'text-3xl';
    if (displayValue.length > 8) return 'text-4xl';
    return 'text-5xl';
  };

  return (
    <div className="bg-calc-display rounded-2xl p-6 mb-4">
      <div 
        className={`${getFontSize()} font-light text-right text-foreground tracking-tight min-h-[3.5rem] flex items-center justify-end overflow-hidden`}
      >
        {displayValue}
      </div>
    </div>
  );
};
