type StatusStripProps = {
  items: Array<{ label: string; value: string | number }>;
};

export function StatusStrip({ items }: StatusStripProps) {
  return (
    <section className="grid gap-3 rounded-lg border border-border bg-panel p-4 shadow-subtle sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="text-xs font-medium uppercase text-muted">{item.label}</div>
          <div className="mt-1 text-sm font-semibold">{item.value}</div>
        </div>
      ))}
    </section>
  );
}
