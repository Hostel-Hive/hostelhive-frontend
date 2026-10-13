import type { PasswordPolicy } from 'firebase/auth';
import { passwordRequirements } from '../password.schema';

interface Props {
  id: string;
  password: string;
  policy: PasswordPolicy;
}
export default function PasswordRequirements({ id, password, policy }: Props) {
  const requirements = passwordRequirements(password, policy);
  return (
    <div id={id} className="password-requirements">
      <progress
        aria-label="Password requirements met"
        max={requirements.length || 1}
        value={requirements.filter((row) => row.met).length}
      />
      <p>Password requirements</p>
      <ul>
        {requirements.map((row) => (
          <li key={row.label} data-met={row.met}>
            <span aria-hidden="true">{row.met ? '✓' : '○'}</span> {row.label}
            <span className="sr-only">{row.met ? ', met' : ', not met'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
