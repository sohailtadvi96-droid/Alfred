import { forwardRef, useState, type FormEvent } from 'react';

export const CommandBar = forwardRef<HTMLInputElement>(function CommandBar(_props, ref) {
  const [value, setValue] = useState('');
  const [echo, setEcho] = useState<string[]>([]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    setEcho((prev) => [text, ...prev].slice(0, 5));
    setValue('');
  }

  return (
    <div className="home-cmdk">
      <form onSubmit={onSubmit}>
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Tell Alfred anything…"
          aria-label="Command bar"
        />
      </form>
      <div className="home-cmdk-hint">⌘K to focus · [ to resize rail</div>
      {echo.length > 0 && (
        <ul className="home-cmdk-echo">
          {echo.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      )}
    </div>
  );
});
