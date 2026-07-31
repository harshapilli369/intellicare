import { useEffect } from 'react';

// A centred panel over the page it was opened from. Escape closes it, and so
// does clicking the backdrop; clicks inside the panel are kept from reaching
// the backdrop so they do not close it by accident.
const Modal = ({ title, onClose, children, width = 'max-w-4xl' }) => {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    // The page behind must not scroll while a panel is over it.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={`max-h-[90vh] w-full ${width} overflow-y-auto rounded-2xl bg-canvas p-8 shadow-xl`}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 text-2xl leading-none text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
          >
            &times;
          </button>
        </div>

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
