import { redirect } from 'next/navigation';

/**
 * Redirects to a specified path with an encoded message as a query parameter.
 * @param {('error' | 'success')} type - The type of message, either 'error' or 'success'.
 * @param {string} path - The path to redirect to.
 * @param {string} message - The message to be encoded and added as a query parameter.
 * @returns {never} This function doesn't return as it triggers a redirect.
 */
export function encodedRedirect(
  type: 'error' | 'success',
  path: string,
  message: string
) {
  return redirect(`${path}?${type}=${encodeURIComponent(message)}`);
}

export const statuses = [
  {
    label: 'Disponibile',
    value: 'free',
  },
  {
    label: 'Trattativa in corso',
    value: 'in_progress',
  },
  {
    label: 'Già cliente',
    value: 'concluded',
  },
  {
    label: 'Bad prospect',
    value: 'failed',
  },
];

export const getStatusLabel = (value: string) => {
  return statuses.find((status) => status.value === value)?.label || value;
};
