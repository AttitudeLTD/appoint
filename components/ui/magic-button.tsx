import React from 'react';

const MagicButton = ({
  title,
  icon,
  position,
  handleClick,
  otherClasses,
  isLoading = false,
}: {
  title: string;
  icon: React.ReactNode;
  position: string;
  handleClick?: () => void;
  otherClasses?: string;
  isLoading?: boolean;
}) => {
  return (
    <button
      className='relative inline-flex h-12 w-full md:w-60 md:mt-10 overflow-hidden rounded-lg p-[1px] focus:outline-none'
      onClick={handleClick}
      disabled={isLoading}
    >
      <span className='absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#F2F2F2_0%,#FF00FF_50%,#F2F2F2_100%)]' />

      {/* remove px-3 py-1, add px-5 gap-2 */}
      <span
        className={`inline-flex h-full w-full cursor-pointer items-center justify-center rounded-lg bg-[#1B304E] px-7 text-sm font-medium text-white backdrop-blur-3xl gap-2 ${
          isLoading ? 'opacity-80' : ''
        } ${otherClasses}`}
      >
        {isLoading ? (
          <span className='inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent mr-2' />
        ) : position === 'left' ? (
          icon
        ) : null}
        {title}
        {!isLoading && position === 'right' ? icon : null}
      </span>
    </button>
  );
};

export default MagicButton;
