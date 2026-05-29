import { Toaster, toast } from 'sonner';

export const notify = {
  success: (message: string): void => {
    toast.success(message);
  },
  error: (message: string): void => {
    toast.error(message);
  },
};

export function NotificationToaster(): JSX.Element {
  return <Toaster richColors position="top-right" closeButton />;
}
