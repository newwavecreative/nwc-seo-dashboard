import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/Dashboard.css';

// In production, use relative /api; in dev, use localhost
const API_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001');

function Dashboard({ token, user, onLogout }) {
  const [summary, setSummary] = useState(null);
  const [topKeywords, setTopKeywords] = useState([]);
  const [topPages, setTopPages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      const [summaryRes, keywordsRes, pagesRes] = await Promise.all([
        axios.get(`${API_URL}/seo/summary`, { headers }),
        axios.get(`${API_URL}/seo/top-keywords`, { headers }),
        axios.get(`${API_URL}/seo/top-pages`, { headers }),
      ]);

      setSummary(summaryRes.data);
      setTopKeywords(keywordsRes.data);
      setTopPages(pagesRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="dashboard"><p>Loading...</p></div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>SEO Dashboard</h1>
        <div className="user-info">
          <span>{user?.name || user?.email}</span>
          <button onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="summary-cards">
        <div className="card">
          <h3>Total Impressions (30d)</h3>
          <p className="big-number">{summary?.total_impressions || 0}</p>
        </div>
        <div className="card">
          <h3>Total Clicks (30d)</h3>
          <p className="big-number">{summary?.total_clicks || 0}</p>
        </div>
        <div className="card">
          <h3>Avg Position</h3>
          <p className="big-number">{summary?.avg_position || '--'}</p>
        </div>
        <div className="card">
          <h3>Keywords</h3>
          <p className="big-number">{summary?.total_queries || 0}</p>
        </div>
      </div>

      <div className="charts-container">
        <div className="chart-box">
          <h2>Top Keywords (30d)</h2>
          {topKeywords.length > 0 ? (
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Keyword</th>
                    <th>Impressions</th>
                    <th>Clicks</th>
                    <th>CTR (%)</th>
                    <th>Avg Position</th>
                  </tr>
                </thead>
                <tbody>
                  {topKeywords.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.query}</td>
                      <td>{item.total_impressions}</td>
                      <td>{item.total_clicks}</td>
                      <td>{item.ctr}</td>
                      <td>{item.avg_position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No data yet. Check back after the first GSC sync.</p>
          )}
        </div>

        <div className="chart-box">
          <h2>Top Pages (30d)</h2>
          {topPages.length > 0 ? (
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Impressions</th>
                    <th>Clicks</th>
                    <th>CTR (%)</th>
                    <th>Avg Position</th>
                  </tr>
                </thead>
                <tbody>
                  {topPages.map((item, idx) => (
                    <tr key={idx}>
                      <td className="url">{item.page_url}</td>
                      <td>{item.total_impressions}</td>
                      <td>{item.total_clicks}</td>
                      <td>{item.ctr}</td>
                      <td>{item.avg_position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No data yet. Check back after the first GSC sync.</p>
          )}
        </div>
      </div>

      <button onClick={fetchData} className="refresh-button">Refresh Data</button>
    </div>
  );
}

export default Dashboard;
