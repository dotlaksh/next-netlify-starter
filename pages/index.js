import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import Papa from 'papaparse';
import axios from 'axios';
import { Dropdown, Button, Spinner, Alert, Card, Navbar, Container, Row, Col } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';

const TIME_PERIODS = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

const ChartLoadingPlaceholder = () => (
  <div className="d-flex justify-content-center align-items-center vh-100">
    <Spinner animation="border" role="status" variant="primary" />
    <div className="ms-2">Loading chart data...</div>
  </div>
);

const StockChart = () => {
  const [stockSymbols, setStockSymbols] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('3M');
  const [currentStats, setCurrentStats] = useState(null);

  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const getChartHeight = useCallback(() => (chartContainerRef.current ? chartContainerRef.current.clientHeight : 600), []);

  useEffect(() => {
    const loadCSV = async () => {
      try {
        const response = await fetch('/nifty50.csv');
        const text = await response.text();
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const symbols = results.data.map(row => row.Symbol).filter(Boolean);
            setStockSymbols(symbols);
            if (symbols.length) fetchStockData(symbols[0], selectedPeriod);
          },
          error: (error) => {
            setError(`Failed to parse CSV: ${error.message}`);
            setLoading(false);
          }
        });
      } catch (error) {
        setError(`Failed to load CSV: ${error.message}`);
        setLoading(false);
      }
    };

    if (typeof window !== 'undefined') {
      loadCSV();
    }

    return () => {
      chartInstanceRef.current?.remove();
      resizeObserverRef.current?.disconnect();
    };
  }, []);

  const fetchStockData = useCallback(async (symbol, period) => {
    if (!symbol) return;

    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      const startDate = new Date();
      const days = TIME_PERIODS.find(t => t.label === period)?.days || 90;
      startDate.setDate(startDate.getDate() - days);

      const response = await axios.get('/api/stockData', {
        params: { symbol, startDate: startDate.toISOString(), endDate: endDate.toISOString() }
      });

      if (response.data?.length) {
        const formattedData = response.data.map(item => ({
          time: new Date(item.time).getTime() / 1000,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseFloat(item.volume)
        }));

        setChartData(formattedData);
        const last = formattedData[formattedData.length - 1];
        const prev = formattedData[formattedData.length - 2];
        setCurrentStats({
          current: last.close.toFixed(2),
          change: (((last.close - prev.close) / prev.close) * 100).toFixed(2),
          high: last.high.toFixed(2),
          low: last.low.toFixed(2),
          volume: (last.volume / 1000000).toFixed(2) + 'M',
        });
      } else {
        setError('No data available for this symbol');
      }
    } catch (error) {
      setError('Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length || typeof window === 'undefined') return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: getChartHeight(),
      layout: { backgroundColor: '#ffffff', textColor: '#333' },
      grid: { vertLines: { color: '#f0f0f0' }, horzLines: { color: '#f0f0f0' } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, rightOffset: 5, minBarSpacing: 5 },
    });

    const candleSeries = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350' });
    candleSeries.setData(chartData);

    chartInstanceRef.current = chart;
    resizeObserverRef.current = new ResizeObserver(() => chart.applyOptions({ width: chartContainerRef.current.clientWidth }));
    resizeObserverRef.current.observe(chartContainerRef.current);
  }, [chartData, getChartHeight]);

  return (
    <div className="d-flex flex-column vh-100">
      <Navbar bg="primary" variant="dark" className="mb-3">
        <Container>
          <Navbar.Brand>Stock Charts</Navbar.Brand>
        </Container>
      </Navbar>

      <Container className="flex-grow-1">
        <Row className="mb-3">
          <Col>
            <Dropdown>
              <Dropdown.Toggle variant="outline-primary">{selectedPeriod}</Dropdown.Toggle>
              <Dropdown.Menu>
                {TIME_PERIODS.map(period => (
                  <Dropdown.Item key={period.label} onClick={() => setSelectedPeriod(period.label)}>
                    {period.label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          </Col>
        </Row>

        <Card className="shadow-sm">
          <Card.Body className="position-relative" ref={chartContainerRef}>
            {loading ? <ChartLoadingPlaceholder /> : error && <Alert variant="danger">{error}</Alert>}
          </Card.Body>
        </Card>
      </Container>

      <footer className="bg-light py-3 mt-auto">
        <Container>
          <Row>
            <Col>
              <Button onClick={() => setCurrentIndex(currentIndex - 1)} disabled={currentIndex === 0}>Previous</Button>
            </Col>
            <Col className="text-center">{currentIndex + 1} / {stockSymbols.length}</Col>
            <Col className="text-end">
              <Button onClick={() => setCurrentIndex(currentIndex + 1)} disabled={currentIndex === stockSymbols.length - 1}>Next</Button>
            </Col>
          </Row>
        </Container>
      </footer>
    </div>
  );
};

export default StockChart;
