import { useEffect, useCallback } from 'react';
import { useCalculator } from '@/hooks/useCalculator';
import { CalculatorDisplay } from './CalculatorDisplay';
import { CalculatorButton } from './CalculatorButton';

export const Calculator = () => {
  const {
    display,
    inputDigit,
    inputDecimal,
    clear,
    allClear,
    toggleSign,
    inputPercent,
    performOperation,
    calculate,
    hasOperator,
  } = useCalculator();

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const { key } = event;

    if (key >= '0' && key <= '9') {
      inputDigit(key);
    } else if (key === '.') {
      inputDecimal();
    } else if (key === '+') {
      performOperation('+');
    } else if (key === '-') {
      performOperation('-');
    } else if (key === '*') {
      performOperation('×');
    } else if (key === '/') {
      event.preventDefault();
      performOperation('÷');
    } else if (key === 'Enter' || key === '=') {
      calculate();
    } else if (key === 'Escape') {
      allClear();
    } else if (key === 'Backspace') {
      clear();
    } else if (key === '%') {
      inputPercent();
    }
  }, [inputDigit, inputDecimal, performOperation, calculate, allClear, clear, inputPercent]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="bg-card rounded-3xl p-5 shadow-lg border border-border">
        <CalculatorDisplay value={display} />
        
        <div className="grid grid-cols-4 gap-3">
          {/* Row 1: AC, +/-, %, ÷ */}
          <CalculatorButton onClick={allClear} variant="function">
            {hasOperator ? 'C' : 'AC'}
          </CalculatorButton>
          <CalculatorButton onClick={toggleSign} variant="function">
            +/−
          </CalculatorButton>
          <CalculatorButton onClick={inputPercent} variant="function">
            %
          </CalculatorButton>
          <CalculatorButton onClick={() => performOperation('÷')} variant="operator">
            ÷
          </CalculatorButton>

          {/* Row 2: 7, 8, 9, × */}
          <CalculatorButton onClick={() => inputDigit('7')}>7</CalculatorButton>
          <CalculatorButton onClick={() => inputDigit('8')}>8</CalculatorButton>
          <CalculatorButton onClick={() => inputDigit('9')}>9</CalculatorButton>
          <CalculatorButton onClick={() => performOperation('×')} variant="operator">
            ×
          </CalculatorButton>

          {/* Row 3: 4, 5, 6, - */}
          <CalculatorButton onClick={() => inputDigit('4')}>4</CalculatorButton>
          <CalculatorButton onClick={() => inputDigit('5')}>5</CalculatorButton>
          <CalculatorButton onClick={() => inputDigit('6')}>6</CalculatorButton>
          <CalculatorButton onClick={() => performOperation('-')} variant="operator">
            −
          </CalculatorButton>

          {/* Row 4: 1, 2, 3, + */}
          <CalculatorButton onClick={() => inputDigit('1')}>1</CalculatorButton>
          <CalculatorButton onClick={() => inputDigit('2')}>2</CalculatorButton>
          <CalculatorButton onClick={() => inputDigit('3')}>3</CalculatorButton>
          <CalculatorButton onClick={() => performOperation('+')} variant="operator">
            +
          </CalculatorButton>

          {/* Row 5: 0, ., = */}
          <CalculatorButton onClick={() => inputDigit('0')} span={2}>
            0
          </CalculatorButton>
          <CalculatorButton onClick={inputDecimal}>.</CalculatorButton>
          <CalculatorButton onClick={calculate} variant="equals">
            =
          </CalculatorButton>
        </div>
      </div>
    </div>
  );
};
