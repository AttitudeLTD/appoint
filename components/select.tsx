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
        backgroundColor: '#ffffff',
        borderColor: state.isFocused
          ? '#224677'
          : '#e5e7eb',
        borderRadius: 'var(--radius)',
        color: '#224677',
        boxShadow: state.isFocused ? '0 0 0 1px #224677' : 'none',
        ':hover': {
          borderColor: state.isFocused
            ? '#224677'
            : '#d1d5db',
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
        backgroundColor: '#ffffff',
        color: '#224677',
        border: '1px solid #e5e7eb',
        borderRadius: 'var(--radius)',
        boxShadow:
          'var(--shadow, 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06))',
        overflow: 'hidden',
        zIndex: 100,
      }),
      option: (base: any, { isFocused, isSelected }: any) => ({
        ...base,
        backgroundColor: isSelected
          ? '#224677'
          : isFocused
            ? '#f3f4f6'
            : '#ffffff',
        color: isSelected
          ? '#ffffff'
          : '#224677',
        padding: '10px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        ':active': {
          backgroundColor: '#f3f4f6',
        },
      }),
      singleValue: (base: any) => ({
        ...base,
        color: '#224677',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }),
      placeholder: (base: any) => ({
        ...base,
        color: '#9ca3af',
      }),
      dropdownIndicator: (base: any) => ({
        ...base,
        color: '#6b7280',
        ':hover': {
          color: '#224677',
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
