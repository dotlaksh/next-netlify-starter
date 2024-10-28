import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import Papa from 'papaparse';
import axios from 'axios';
import { Navbar, Container, Row, Col, Button, Dropdown, Spinner, Card, Alert } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';

const TIME_PERIODS = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

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

  useEffect(() => {
    const loadCSV = async () => {
      try {
        const response = await fetch('/nifty50.csv');
        const text = await response.text();
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const symbols = results.data.map((row) => row.Symbol).filter(Boolean);
            setStockSymbols(symbols);
            if (symbols.length) fetchStockData(symbols[0], selectedPeriod);
          },
          error: (error) => {
            setError(`Failed to parse CSV: ${error.message}`);
            setLoading(false);
          },
        });
      } catch (error) {
        setError(`Failed to load CSV: ${error.message}`);
        setLoading(false);
      }
    };

    loadCSV();

    return () => {
      chartInstanceRef.current?.remove();
      resizeObserverRef.current?.disconnect();
    };
  }, [selectedPeriod]);

  const fetchStockData = useCallback(async (symbol, period) => {
    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - TIME_PERIODS.find((t) => t.label === period)?.days || 90);

      const response = await axios.get('/api/stockData', {
        params: { symbol, startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      });

      const data = response.data.map((item) => ({
        time: new Date(item.time).getTime() / 1000,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      }));

      setChartData(data);
      setCurrentStats({
        current: data[data.length - 1].close.toFixed(2),
        high: data[data.length - 1].high.toFixed(2),
        low: data[data.length - 1].low.toFixed(2),
        volume: `${(data[data.length - 1].volume / 1_000_000).toFixed(2)}M`,
      });
    } catch (error) {
      setError('Failed to fetch stock data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: { backgroundColor: '#ffffff', textColor: '#000' },
      grid: { vertLines: { color: '#f0f0f0' }, horzLines: { color: '#f0f0f0' } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#4caf50',
      downColor: '#f44336',
      borderUpColor: '#4caf50',
      borderDownColor: '#f44336',
    });

    series.setData(chartData);
    chartInstanceRef.current = chart;

    resizeObserverRef.current = new ResizeObserver(() => {
      chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    });
    resizeObserverRef.current.observe(chartContainerRef.current);

    return () => {
      resizeObserverRef.current.disconnect();
      chart.remove();
    };
  }, [chartData]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      fetchStockData(stockSymbols[currentIndex - 1], selectedPeriod);
    }
  };

  const handleNext = () => {
    if (currentIndex < stockSymbols.length - 1) {
      setCurrentIndex(currentIndex + 1);
      fetchStockData(stockSymbols[currentIndex + 1], selectedPeriod);
    }
  };

  return (
    <div className="d-flex flex-column vh-100">
      {/* Top Navbar */}
      <Navbar bg="dark" variant="dark" className="shadow-sm">
        <Container>
          <Navbar.Brand>Stock Charts</Navbar.Brand>
        </Container>
      </Navbar>

      {/* Chart Container */}
      <Container className="my-4 flex-grow-1">
        <Card className="shadow-sm">
          <Card.Body>
            <div
              ref={chartContainerRef}
              className="position-relative"
              style={{ height: '400px' }}
            >
              {loading && (
                <div className="d-flex justify-content-center align-items-center h-100">
                  <Spinner animation="border" role="status" variant="primary" />
                </div>
              )}
              {error && <Alert variant="danger">{error}</Alert>}
            </div>
          </Card.Body>
        </Card>
      </Container>

      {/* Bottom Navbar for Pagination */}
      <Navbar bg="light" className="shadow-sm">
        <Container className="justify-content-between">
          <Button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            variant="outline-primary"
          >
            Previous
          </Button>
          <div>
            {currentIndex + 1} / {stockSymbols.length}
          </div>
          <Button
            onClick={handleNext}
            disabled={currentIndex === stockSymbols.length - 1}
            variant="outline-primary"
          >
            Next
          </Button>
        </Container>
      </Navbar>
    </div>
  );
};

export default StockChart;
