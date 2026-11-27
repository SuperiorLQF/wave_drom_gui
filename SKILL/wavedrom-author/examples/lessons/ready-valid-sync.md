Ready/valid 同步与背压（12 格，半周期）。CLK 从 0 开始高低交替。
格值为边沿后状态，握手按边沿前值判断。VALID 和 READY 初值为 0，DATA 初值 x。
格 3 上升沿后发送方置 VALID=1、DATA=A。格 5 上升沿后接收方置 READY=1。此前的等待期间 VALID 和 DATA 保持。
格 7 上升沿接收 A，此后发送方把 DATA 更新为 B，VALID 保持 1。格 9 上升沿接收 B，此后 VALID、READY 清 0，DATA 变 x。
分别列出发起、背压采样、握手的边沿；不要把格 5 刚拉高的 READY 算作格 5 已发生握手。
