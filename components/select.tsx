import { useMemo } from 'react';
import { SingleValue } from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { useTheme } from 'next-themes'; // Assuming you're using next-themes for dark/light mode

type Props = {
  onChange: (value?: string) => void;
  onCreate?: (value: string) => void;
  options?: { label: string; value: string }[];
  value?: string | null | undefined;
  disabled?: boolean;
  placeholder?: string;
};

export const Select = ({
  value,
  onChange,
  disabled,
  onCreate,
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
    <CreatableSelect
      placeholder={placeholder}
      className='text-sm h-10'
      styles={customStyles}
      value={formattedValue}
      onChange={onSelect}
      options={options}
      onCreateOption={onCreate}
      isDisabled={disabled}
    />
  );
};
