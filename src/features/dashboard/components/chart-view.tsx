"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Chart, ChartColumn } from "../chart-data";
import { formatKpi } from "../format";

// Rendu d'un graphique : une seule échelle, marques fines, info-bulle au
// survol, légende dès deux séries, et le tableau des valeurs en dessous
// (accessibilité, impression). Une valeur inconnue reste un trou.

const COMPACT = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

function axisTick(chart: Chart) {
  return (value: number) => (chart.format === "percent" ? `${COMPACT.format(value)} %` : COMPACT.format(value));
}

function format(column: Pick<ChartColumn, "format" | "currency">, value: unknown) {
  return formatKpi({ value: typeof value === "number" ? value : null, format: column.format, currency: column.currency });
}

/** Hauteur d'un graphique horizontal : une rangée par catégorie, axe compris. */
const hbarHeight = (rows: number) => Math.max(120, rows * 36 + 40);

export function ChartView({ chart }: { chart: Chart }) {
  const config: ChartConfig = Object.fromEntries(chart.series.map((s) => [s.key, { label: s.label, color: `var(--chart-${s.color})` }]));
  const data = chart.rows.map((row) => ({ label: row.label, title: row.title ?? row.label, ...row.values }));
  const empty = !chart.rows.some((row) => chart.series.some((s) => row.values[s.key] !== null && row.values[s.key] !== undefined));
  const legend = chart.series.length > 1;
  const tooltip = (
    <ChartTooltip
      cursor={chart.kind === "line" ? true : { fillOpacity: 0.4 }}
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) => payload?.[0]?.payload?.title ?? ""}
          formatter={(value, name, item) => (
            <div className="flex w-full items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color ?? item.payload?.fill }} />
              <span className="text-muted-foreground">{config[String(name)]?.label ?? name}</span>
              <span className="ml-auto pl-3 font-medium text-foreground tabular-nums">{format(chart, value)}</span>
            </div>
          )}
        />
      }
    />
  );

  return (
    <figure className="flex min-w-0 flex-col gap-2 break-inside-avoid">
      <figcaption className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{chart.title}</span>
        {chart.description && <span className="text-xs text-muted-foreground">{chart.description}</span>}
      </figcaption>

      {empty ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Aucune donnée sur ces périodes.</p>
      ) : chart.kind === "line" ? (
        <ChartContainer config={config} className="aspect-auto h-60 w-full" role="img" aria-label={`${chart.title} : graphique, valeurs dans le tableau`}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
            <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={axisTick(chart)} allowDecimals={false} />
            {tooltip}
            {legend && <ChartLegend content={<ChartLegendContent />} />}
            {chart.series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                type="linear"
                stroke={`var(--color-${s.key})`}
                strokeWidth={2}
                dot={{ r: 3, fill: `var(--color-${s.key})`, strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      ) : chart.kind === "hbar" ? (
        <ChartContainer
          config={config}
          className="aspect-auto w-full"
          style={{ height: hbarHeight(data.length) }}
          role="img"
          aria-label={`${chart.title} : graphique, valeurs dans le tableau`}
        >
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }} accessibilityLayer>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={axisTick(chart)} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={150} tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
            {tooltip}
            {chart.series.map((s) => (
              <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
            ))}
          </BarChart>
        </ChartContainer>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-60 w-full" role="img" aria-label={`${chart.title} : graphique, valeurs dans le tableau`}>
          <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barGap={2} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
            <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={axisTick(chart)} allowDecimals={false} />
            {tooltip}
            {legend && <ChartLegend content={<ChartLegendContent />} />}
            {chart.series.map((s, index) =>
              chart.kind === "stacked" ? (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="pile"
                  fill={`var(--color-${s.key})`}
                  stroke="var(--card)"
                  strokeWidth={2}
                  radius={index === chart.series.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={36}
                  isAnimationActive={false}
                />
              ) : (
                <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              ),
            )}
          </BarChart>
        </ChartContainer>
      )}

      {chart.notes.length > 0 && (
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-xs text-muted-foreground">
          {chart.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {chart.rows.length > 0 && (
        <details className="text-sm print:hidden">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Voir les valeurs</summary>
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>{chart.kind === "hbar" ? "" : "Période"}</TableHead>
                {chart.series.map((s) => (
                  <TableHead key={s.key} className="text-right">
                    {s.label}
                  </TableHead>
                ))}
                {chart.extras?.map((e) => (
                  <TableHead key={e.key} className="text-right">
                    {e.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {chart.rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.title ?? row.label}</TableCell>
                  {chart.series.map((s) => (
                    <TableCell key={s.key} className="text-right tabular-nums">
                      {format(chart, row.values[s.key])}
                    </TableCell>
                  ))}
                  {chart.extras?.map((e) => (
                    <TableCell key={e.key} className="text-right tabular-nums">
                      {format(e, row.values[e.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </details>
      )}
    </figure>
  );
}
