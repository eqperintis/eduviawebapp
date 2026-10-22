"use client";

import { useState } from "react";

/**
 * Submissions per day, as on Formspree's overview: one series, so no legend
 * (the card title names it). Bars rise from the baseline with 4px rounded
 * tops and a 2px gap; indigo is the one data colour, everything else ink.
 * Each day has a full-height hover target with a tooltip, and the same
 * numbers sit in a table for screen readers.
 */

export type DayCount = { date: string; label: string; count: number };

const HEIGHT = 180;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;
const PAD_LEFT = 28;
const GAP = 2;

function niceMax(max: number): number {
  if (max <= 4) return Math.max(max, 1) + (max === 0 ? 1 : 0);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / step) * step;
}

export function SubmissionsChart({ days }: { days: DayCount[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const plotW = width - PAD_LEFT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const max = niceMax(Math.max(0, ...days.map((day) => day.count)));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max / 2, max];
  const slot = plotW / days.length;
  const barW = Math.max(2, slot - GAP);
  const y = (value: number) => PAD_TOP + plotH - (value / max) * plotH;
  const active = hover === null ? null : days[hover];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label="Submissions per day, last 30 days" onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD_LEFT} x2={width} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "axis" : "grid"} />
            <text x={PAD_LEFT - 8} y={y(tick)} dy="0.35em" textAnchor="end" className="tick">
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          </g>
        ))}
        {days.map((day, index) => {
          const x = PAD_LEFT + index * slot + GAP / 2;
          const h = plotH * (day.count / max);
          const r = Math.min(4, barW / 2, h);
          const top = PAD_TOP + plotH - h;
          return (
            <g key={day.date}>
              {day.count > 0 && (
                <path
                  className={`bar${hover === index ? " on" : ""}`}
                  d={`M${x},${PAD_TOP + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${PAD_TOP + plotH} Z`}
                />
              )}
              {index % 7 === 0 && (
                <text x={x + barW / 2} y={HEIGHT - 6} textAnchor="middle" className="tick">
                  {day.label}
                </text>
              )}
              <rect
                x={PAD_LEFT + index * slot}
                y={PAD_TOP}
                width={slot}
                height={plotH}
                className="hit"
                onMouseEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                tabIndex={0}
                aria-label={`${day.label}: ${day.count} submission${day.count === 1 ? "" : "s"}`}
              />
            </g>
          );
        })}
      </svg>
      {active && hover !== null && (
        <div
          className="chart-tip"
          style={{ left: `${((PAD_LEFT + hover * slot + slot / 2) / width) * 100}%` }}
          role="status"
        >
          <strong>
            {active.count} submission{active.count === 1 ? "" : "s"}
          </strong>
          <span>{active.label}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>Submissions per day, last 30 days</caption>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.label}</th>
              <td>{day.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
