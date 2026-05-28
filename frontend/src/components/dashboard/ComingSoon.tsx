const ComingSoon = ({ title }: { title: string }) => {
  return (
    <div className="dashboard-card">
      <h3 className="dashboard-card-title">{title}</h3>
      <div className="dashboard-card-content">
        <p>(Phase 2에서 구현될 영역)</p>
      </div>
    </div>
  );
};

export default ComingSoon;
