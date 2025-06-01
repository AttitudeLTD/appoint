import { Button } from '@/components/ui/button';
import { signOutAction } from '@/app/actions';
import { Shield, Mail, AlertTriangle } from 'lucide-react';
import { getAllowedEmailDomains } from '@/utils/auth';

export default function UnauthorizedPage() {
  const allowedDomains = getAllowedEmailDomains();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100">
      <div className="max-w-md w-full mx-auto p-8">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Access Denied
          </h1>
          
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm text-red-800 font-medium mb-2">
                  Unauthorized Email Domain
                </p>
                <p className="text-sm text-red-700">
                  This application is restricted to users with @attitudeltd.com or @attitudegroupspa.com email addresses.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm text-blue-800 font-medium mb-1">
                  Allowed Email Domains:
                </p>
                <ul className="text-sm text-blue-700 space-y-1">
                  {allowedDomains.map((domain, index) => (
                    <li key={index}>• {domain}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <form action={signOutAction}>
            <Button 
              type="submit" 
              variant="outline" 
              className="w-full"
            >
              Sign Out
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
} 