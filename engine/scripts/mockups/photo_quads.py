"""사용: python -I scripts/mockups/photo_quads.py <원본 PNG> <x0,y0,x1,y1 찾을 범위> <최소 밝기> <최대 채도> <확인용 PNG>

시안 사진(메뉴판 세움판 종이·포장 라벨·휴대폰 화면)에서 밝고 채도가 낮은 면의 네 꼭짓점을 찾는다.
가장 큰 덩어리 윤곽의 네 변 가운데 70% 점들에 직선을 맞추고 만나는 점을 왼위·오른위·오른아래·왼아래로 낸다.
종이가 벽과 색이 비슷한 액자 메뉴판(menu-wall)은 밝기 대신 검은 테(밝기 80 미만) 안쪽 덩어리를 마스크로 써서 찾았다. Mockups.tsx 값이 원본.
"""
import sys, cv2, numpy as np, json
def mask_of(path, roi, gmin, smax):
    im = cv2.imread(path); g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY); hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    x0,y0,x1,y1 = roi
    m = np.zeros(g.shape, np.uint8)
    sub = ((g >= gmin) & (hsv[...,1] <= smax)).astype(np.uint8)*255
    m[y0:y1, x0:x1] = sub[y0:y1, x0:x1]
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5,5),np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15,15),np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    k = 1 + st[1:, cv2.CC_STAT_AREA].argmax()
    m = (lab == k).astype(np.uint8)*255
    return im, m
def fit_quad(m):
    cs,_ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea).reshape(-1,2).astype(float)
    hull = cv2.convexHull(c.astype(np.float32))
    for eps in np.linspace(0.005, 0.08, 80):
        ap = cv2.approxPolyDP(hull, eps*cv2.arcLength(hull, True), True)
        if len(ap) == 4: break
    q = ap.reshape(-1,2).astype(float)
    # order tl,tr,br,bl
    cen = q.mean(0); ang = np.arctan2(q[:,1]-cen[1], q[:,0]-cen[0])
    q = q[np.argsort(ang)]  # 화면 좌표에서 시계 방향
    k = int(np.argmin(q.sum(1))); q = np.roll(q, -k, axis=0)  # 왼위부터
    lines = []
    for i in range(4):
        a, b = q[i], q[(i+1)%4]
        v = b - a; L = np.linalg.norm(v); u = v/L; nrm = np.array([-u[1], u[0]])
        t = (c - a) @ u; dd = np.abs((c - a) @ nrm)
        sel = c[(t > 0.15*L) & (t < 0.85*L) & (dd < 12)]
        if len(sel) < 10:
            lines.append((a, u)); continue
        vx, vy, x0, y0 = cv2.fitLine(sel.astype(np.float32), cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
        lines.append((np.array([x0,y0]), np.array([vx,vy])))
    pts = []
    for i in range(4):
        (p1,d1),(p2,d2) = lines[(i-1)%4], lines[i]
        A = np.array([d1, -d2]).T; t = np.linalg.solve(A, p2-p1)
        pts.append(p1 + t[0]*d1)
    return [[round(float(x),1), round(float(y),1)] for x,y in pts]
if __name__ == "__main__":
    path, roi, gmin, smax = sys.argv[1], tuple(map(int, sys.argv[2].split(','))), int(sys.argv[3]), int(sys.argv[4])
    im, m = mask_of(path, roi, gmin, smax)
    q = fit_quad(m)
    print(json.dumps(q))
    dbg = im.copy()
    cv2.polylines(dbg, [np.array(q, np.int32)], True, (0,0,255), 2)
    cv2.imwrite(sys.argv[5], dbg)
    cv2.imwrite(sys.argv[5].replace('.png','-mask.png'), m)
