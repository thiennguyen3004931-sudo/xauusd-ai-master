import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError() {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 40,
            color: "white",
          }}
        >
          <h2>Application Error</h2>

          <p>Something went wrong.</p>
        </div>
      );
    }

    return this.props.children;
  }
}