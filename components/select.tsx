'use client';

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
  const { theme } = useTheme(); // Detect the current theme

  const onSelect = (option: SingleValue<{ label: string; value: string }>) => {
    onChange(option?.value);
  };

  const formattedValue = useMemo(() => {
    return options.find((option) => option.value === value);
  }, [options, value]);

  const customStyles = useMemo(() => {
    const isDark = theme === 'dark';
    return {
      control: (base: any) => ({
        ...base,
        backgroundColor: isDark ? '#2d3748' : '#fff',
        borderColor: isDark ? '#4a5568' : '#e2e8f0',
        color: isDark ? '#cbd5e0' : '#1a202c',
        ':hover': {
          borderColor: isDark ? '#a0aec0' : '#cbd5e0',
        },
      }),
      menu: (base: any) => ({
        ...base,
        backgroundColor: isDark ? '#2d3748' : '#fff',
        color: isDark ? '#cbd5e0' : '#1a202c',
      }),
      option: (base: any, { isFocused }: any) => ({
        ...base,
        backgroundColor: isFocused
          ? isDark
            ? '#4a5568'
            : '#e2e8f0'
          : isDark
            ? '#2d3748'
            : '#fff',
        color: isDark ? '#cbd5e0' : '#1a202c',
      }),
      singleValue: (base: any) => ({
        ...base,
        color: isDark ? '#cbd5e0' : '#1a202c',
      }),
    };
  }, [theme]);

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
