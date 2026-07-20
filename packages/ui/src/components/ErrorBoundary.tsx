import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface FallbackProps {
  onReload: () => void;
}

function ErrorFallback({ onReload }: FallbackProps) {
  const { t } = useTranslation();
  return (
    <div className="error-boundary-fallback">
      <p>{t("error.generic")}</p>
      <button className="btn-secondary" onClick={onReload}>
        {t("modal.retry")}
      </button>
    </div>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onReload={() => window.location.reload()} />;
    }
    return this.props.children;
  }
}
