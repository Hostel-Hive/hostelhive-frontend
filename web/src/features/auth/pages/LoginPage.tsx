import LoginForm from '../components/LoginForm';
import { Link } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';

export default function LoginPage({ student = false }: { student?: boolean }) {
  return (
    <section className="auth-panel" aria-labelledby="login-title">
      <p className="eyebrow">{student ? 'Student portal' : 'Welcome back'}</p>
      <h1 id="login-title">
        Sign in to <em>HostelHive.</em>
      </h1>
      <p className="auth-description">
        {student
          ? 'Sign in with your approved student account email and HostelHive password.'
          : 'Warden & administrator portal for hostel management.'}
      </p>
      <LoginForm student={student} />
      <p className="auth-divider">
        {student ? 'Invited students only' : 'Hostel staff only'}
      </p>
      <Link
        className="auth-back-link"
        to={student ? routePaths.login : routePaths.studentLogin}
      >
        {student ? 'Staff sign in' : 'Student sign in'}
      </Link>
    </section>
  );
}
