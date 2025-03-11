import { useMemo } from 'react';
import { useTheme } from 'next-themes';
import Select, { SingleValue, components } from 'react-select';
import { ChevronDown } from 'lucide-react';

export type SelectOption = {
  label: string;
  value: string;
  icon?: React.ReactNode;
};

type Props = {
  onChange: (value?: string) => void;
  onCreate?: (value: string) => void; // This prop is no longer needed if you're disabling creation
  options?: { label: string; value: string; icon?: React.ReactNode }[];
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

  const onSelect = (
    option: SingleValue<{
      label: string;
      value: string;
      icon?: React.ReactNode;
    }>
  ) => {
    onChange(option?.value);
  };

  const formattedValue = useMemo(() => {
    return options.find((option) => option.value === value);
  }, [options, value]);

  const customStyles = useMemo(() => {
    return {
      control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'hsl(var(--card))',
        borderColor: state.isFocused
          ? 'hsl(var(--primary))'
          : 'hsl(var(--border))',
        borderRadius: 'var(--radius)',
        color: 'hsl(var(--foreground))',
        boxShadow: state.isFocused ? '0 0 0 1px hsl(var(--primary))' : 'none',
        ':hover': {
          borderColor: state.isFocused
            ? 'hsl(var(--primary))'
            : 'hsl(var(--border-hover, var(--border)))',
        },
        padding: '2px 8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }),
      valueContainer: (base: any) => ({
        ...base,
        padding: '2px 8px',
      }),
      menu: (base: any) => ({
        ...base,
        backgroundColor: 'hsl(var(--popover))',
        color: 'hsl(var(--popover-foreground))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--radius)',
        boxShadow:
          'var(--shadow, 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06))',
        overflow: 'hidden',
        zIndex: 100,
      }),
      option: (base: any, { isFocused, isSelected }: any) => ({
        ...base,
        backgroundColor: isSelected
          ? 'hsl(var(--primary))'
          : isFocused
            ? 'hsl(var(--accent))'
            : 'hsl(var(--popover))',
        color: isSelected
          ? 'hsl(var(--primary-foreground))'
          : 'hsl(var(--foreground))',
        padding: '10px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        ':active': {
          backgroundColor: 'hsl(var(--accent))',
        },
      }),
      singleValue: (base: any) => ({
        ...base,
        color: 'hsl(var(--foreground))',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }),
      placeholder: (base: any) => ({
        ...base,
        color: 'hsl(var(--muted-foreground))',
      }),
      dropdownIndicator: (base: any) => ({
        ...base,
        color: 'hsl(var(--muted-foreground))',
        ':hover': {
          color: 'hsl(var(--foreground))',
        },
        padding: '0 8px',
      }),
      indicatorSeparator: () => ({
        display: 'none',
      }),
    };
  }, []);

  // Custom Option component with icon
  const Option = (props: any) => (
    <components.Option {...props}>
      {props.data.icon && <span className='mr-2'>{props.data.icon}</span>}
      {props.data.label}
    </components.Option>
  );

  // Custom SingleValue component with icon
  const SingleValue = (props: any) => (
    <components.SingleValue {...props}>
      {props.data.icon && <span className='mr-2'>{props.data.icon}</span>}
      {props.data.label}
    </components.SingleValue>
  );

  return (
    <Select
      placeholder={placeholder}
      className='text-sm'
      styles={customStyles}
      value={formattedValue}
      onChange={onSelect}
      options={options}
      isDisabled={disabled}
      isSearchable={false}
      components={{
        DropdownIndicator: (props) => (
          <ChevronDown size={16} className='text-muted-foreground mx-2' />
        ),
        Option,
        SingleValue,
      }}
    />
  );
};
