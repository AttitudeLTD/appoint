import { useMemo } from 'react';
import Select from 'react-select'; // Changed from CreatableSelect to Select
import { SingleValue } from 'react-select';
import { useTheme } from 'next-themes'; // Assuming you're using next-themes for dark/light mode

type Props = {
  onChange: (value?: string) => void;
  onCreate?: (value: string) => void; // This prop is no longer needed if you're disabling creation
  options?: { label: string; value: string }[];
  value?: string | null | undefined;
  disabled?: boolean;
  placeholder?: string;
};

export const SelectComponent = ({
  value,
  onChange,
  disabled,
  options = [],
  placeholder,
}: Props) => {
  const { theme } = useTheme();

  const onSelect = (option: SingleValue<{ label: string; value: string }>) => {
    onChange(option?.value);
  };

  const formattedValue = useMemo(() => {
    return options.find((option) => option.value === value);
  }, [options, value]);

  const customStyles = useMemo(() => {
    return {
      control: (base: any) => ({
        ...base,
        backgroundColor: 'hsl(var(--card))',
        borderColor: 'hsl(var(--border))',
        borderRadius: 'var(--radius)',
        color: 'hsl(var(--foreground))',
        ':hover': {
          borderColor: 'hsl(var(--border))',
        },
      }),
      menu: (base: any) => ({
        ...base,
        backgroundColor: 'hsl(var(--popover))',
        color: 'hsl(var(--popover-foreground))',
        border: '1px solid hsl(var(--border))',
      }),
      option: (base: any, { isFocused }: any) => ({
        ...base,
        backgroundColor: isFocused
          ? 'hsl(var(--muted))'
          : 'hsl(var(--popover))',
        color: 'hsl(var(--foreground))',
      }),
      singleValue: (base: any) => ({
        ...base,
        color: 'hsl(var(--foreground))',
      }),
      placeholder: (base: any) => ({
        ...base,
        color: 'hsl(var(--muted-foreground))',
      }),
    };
  }, []);

  return (
    <Select
      placeholder={placeholder}
      className='text-sm h-10'
      styles={customStyles}
      value={formattedValue}
      onChange={onSelect}
      options={options}
      isDisabled={disabled}
      // isClearable
    />
  );
};
