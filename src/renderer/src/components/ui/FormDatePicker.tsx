import type { InputHTMLAttributes } from 'react';
import { FormInput } from './FormInput';

export function FormDatePicker(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }): JSX.Element {
  return <FormInput type="date" {...props} />;
}
