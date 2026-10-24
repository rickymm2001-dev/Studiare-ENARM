// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IndicatorCard } from '@/ui/components/indicator-card';
import { StatCard } from '@/ui/components/stat-card';
import { BarsVsLine } from './bars-vs-line';
import { Donut } from './donut';
import { Gauge } from './gauge';
import { RangeBar } from './range-bar';
import { RingChart } from './ring-chart';
import { Sparkline } from './sparkline';

describe('gráficas compartidas (D-150)', () => {
  it('el anillo llena cada aro según su valor y recorta lo que pasa del máximo', () => {
    render(
      <RingChart
        label="Tarjetas"
        rings={[
          { value: 90, max: 100, strokeClass: 'stroke-indicator' },
          { value: 0, max: 100, strokeClass: 'stroke-chart-compare' },
          { value: 300, max: 100, strokeClass: 'stroke-danger' },
        ]}
      >
        <span>1,226</span>
      </RingChart>,
    );
    const svg = screen.getByRole('img', { name: 'Tarjetas' });
    const filled = [...svg.querySelectorAll('circle[stroke-dasharray]')];
    // El aro vacío no pinta su parte llena
    expect(filled).toHaveLength(2);
    const [outer, inner] = filled.map((circle) =>
      Number(circle.getAttribute('stroke-dasharray')?.split(' ')[0]),
    );
    const outerLength = 2 * Math.PI * (90 - 7);
    expect(outer).toBeCloseTo(0.9 * outerLength, 3);
    const innerLength = 2 * Math.PI * (90 - 7 - 40);
    expect(inner).toBeCloseTo(innerLength, 3);
    expect(screen.getByText('1,226')).toBeVisible();
  });

  it('el medidor llena la mitad del arco con la mitad del valor', () => {
    render(
      <Gauge value={50} max={100} strokeClass="stroke-success" label="Pulso 50 de 100">
        <span>50</span>
      </Gauge>,
    );
    const arc = screen
      .getByRole('img', { name: 'Pulso 50 de 100' })
      .querySelector('path[stroke-dasharray]');
    expect(Number(arc?.getAttribute('stroke-dasharray')?.split(' ')[0])).toBeCloseTo(
      (Math.PI * 90) / 2,
      3,
    );
  });

  it('la sparkline es decorativa sin etiqueta y una imagen con ella', () => {
    const { rerender } = render(
      <Sparkline values={[1, 3, 2]} strokeClass="stroke-success" fillClass="fill-success" />,
    );
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    rerender(
      <Sparkline
        values={[1, 3, 2]}
        strokeClass="stroke-success"
        fillClass="fill-success"
        label="Retención de los últimos días"
      />,
    );
    expect(screen.getByRole('img', { name: 'Retención de los últimos días' })).toBeInTheDocument();
    expect(document.querySelectorAll('path')).toHaveLength(2);
  });

  it('la dona reparte el perímetro entre las rebanadas y escribe el porcentaje de las que se ven', () => {
    render(
      <Donut
        label="Tarjetas por rama"
        segments={[
          { value: 60, strokeClass: 'stroke-mi' },
          { value: 38, strokeClass: 'stroke-ped' },
          { value: 2, strokeClass: 'stroke-gyo' },
        ]}
      >
        <span>100</span>
      </Donut>,
    );
    const svg = screen.getByRole('img', { name: 'Tarjetas por rama' });
    expect(svg.querySelectorAll('circle')).toHaveLength(3);
    // La rebanada del 2 por ciento no tiene espacio para su número
    expect([...svg.querySelectorAll('text')].map((text) => text.textContent)).toEqual([
      '60%',
      '38%',
    ]);
  });

  it('la barra de rango coloca el marcador y escribe los extremos', () => {
    render(
      <RangeBar
        zones={['bad', 'mid', 'good']}
        position={140}
        label="Aciertos 68 por ciento"
        ticks={['40 %', '70 %, meta', '100 %']}
      />,
    );
    const bar = screen.getByRole('img', { name: 'Aciertos 68 por ciento' });
    // Más de 100 se recorta
    expect(bar).toHaveStyle({ '--marker': '100%' });
    expect(screen.getByText('70 %, meta')).toBeVisible();
  });

  it('barras contra línea pone la tabla para el lector de pantalla y marca la barra más alta', () => {
    render(
      <BarsVsLine
        current={[10, 30, 20]}
        previous={[12, 8, 25]}
        labels={['Lun', 'Mar', 'Mié']}
        caption="Preguntas por día"
        currentName="Esta semana"
        previousName="Semana pasada"
      />,
    );
    expect(screen.getByRole('table', { name: 'Preguntas por día' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Esta semana/ })).toHaveTextContent('10');
    expect(document.querySelectorAll('rect.fill-chart-done')).toHaveLength(1);
  });

  it('las tarjetas de cifra e indicador escriben su estado y su cambio con texto', () => {
    render(
      <>
        <StatCard
          icon={<svg />}
          title="Aciertos"
          value="68 %"
          delta={{ text: '4 pts', direction: 'up' }}
        />
        <IndicatorCard
          title="Retención"
          state="Óptima"
          tone="good"
          value="91"
          unit="%"
          note="Meta 90 %"
        />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Aciertos' })).toBeVisible();
    expect(screen.getByText('4 pts')).toHaveClass('text-success');
    expect(screen.getByText('Óptima')).toHaveClass('text-success');
    expect(screen.getByText('Meta 90 %')).toBeVisible();
  });
});
